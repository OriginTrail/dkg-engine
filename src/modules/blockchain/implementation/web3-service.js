/* eslint-disable no-await-in-loop */
import { ethers, BigNumber } from 'ethers';
import axios from 'axios';
import async from 'async';
import { setTimeout as sleep } from 'timers/promises';

import {
    SOLIDITY_ERROR_STRING_PREFIX,
    SOLIDITY_PANIC_CODE_PREFIX,
    SOLIDITY_PANIC_REASONS,
    ZERO_PREFIX,
    TRANSACTION_QUEUE_CONCURRENCY,
    TRANSACTION_POLLING_TIMEOUT_MILLIS,
    TRANSACTION_CONFIRMATIONS,
    WS_RPC_PROVIDER_PRIORITY,
    HTTP_RPC_PROVIDER_PRIORITY,
    FALLBACK_PROVIDER_QUORUM,
    RPC_PROVIDER_STALL_TIMEOUT,
    CACHED_FUNCTIONS,
    CACHE_DATA_TYPES,
    CONTRACTS,
    CONTRACT_FUNCTION_PRIORITY,
    TRANSACTION_PRIORITY,
    CONTRACT_FUNCTION_GAS_LIMIT_INCREASE_FACTORS,
    ABIs,
} from '../../../constants/constants.js';
import Web3ServiceValidator from './web3-service-validator.js';

class Web3Service {
    async initialize(config, logger) {
        this.config = config;
        this.logger = logger;
        this.contractCallCache = {};
        await this.initializeWeb3();
        this.initializeTransactionQueues();
        await this.initializeContracts();

        this.initializeProviderDebugging();
    }

    initializeTransactionQueues(concurrency = TRANSACTION_QUEUE_CONCURRENCY) {
        this.transactionQueues = {};
        for (const operationalWallet of this.operationalWallets) {
            const transactionQueue = async.priorityQueue((args, cb) => {
                const { contractInstance, functionName, transactionArgs, gasPrice } = args;
                this._executeContractFunction(
                    contractInstance,
                    functionName,
                    transactionArgs,
                    gasPrice,
                    operationalWallet,
                )
                    .then((result) => {
                        cb({ result });
                    })
                    .catch((error) => {
                        cb({ error });
                    });
            }, concurrency);
            this.transactionQueues[operationalWallet.address] = transactionQueue;
        }
        this.transactionQueueOrder = Object.keys(this.transactionQueues);
    }

    queueTransaction(contractInstance, functionName, transactionArgs, callback, gasPrice) {
        const selectedQueue = this.selectTransactionQueue();
        const priority = CONTRACT_FUNCTION_PRIORITY[functionName] ?? TRANSACTION_PRIORITY.MEDIUM;
        this.logger.info(`Calling ${functionName} with priority: ${priority}`);
        selectedQueue.push(
            {
                contractInstance,
                functionName,
                transactionArgs,
                gasPrice,
            },
            priority,
            callback,
        );
    }

    removeTransactionQueue(walletAddress) {
        delete this.transactionQueues[walletAddress];
    }

    getTotalTransactionQueueLength() {
        let totalLength = 0;
        Object.values(this.transactionQueues).forEach((queue) => {
            totalLength += queue.length();
        });
        return totalLength;
    }

    selectTransactionQueue() {
        const queues = Object.keys(this.transactionQueues).map((wallet) => ({
            wallet,
            length: this.transactionQueues[wallet].length(),
        }));
        const minLength = Math.min(...queues.map((queue) => queue.length));
        const shortestQueues = queues.filter((queue) => queue.length === minLength);
        if (shortestQueues.length === 1) {
            return this.transactionQueues[shortestQueues[0].wallet];
        }

        const selectedQueueWallet = this.transactionQueueOrder.find((roundRobinNext) =>
            shortestQueues.some((shortestQueue) => shortestQueue.wallet === roundRobinNext),
        );

        this.transactionQueueOrder.push(
            this.transactionQueueOrder
                .splice(this.transactionQueueOrder.indexOf(selectedQueueWallet), 1)
                .pop(),
        );
        return this.transactionQueues[selectedQueueWallet];
    }

    getValidOperationalWallets() {
        const wallets = [];
        this.config.operationalWallets.forEach((wallet) => {
            try {
                wallets.push(new ethers.Wallet(wallet.privateKey, this.provider));
            } catch (error) {
                this.logger.warn(
                    `Invalid evm private key, unable to create wallet instance. Wallet public key: ${wallet.evmAddress}. Error: ${error.message}`,
                );
            }
        });
        return wallets;
    }

    getRandomOperationalWallet() {
        const randomIndex = Math.floor(Math.random() * this.operationalWallets.length);
        return this.operationalWallets[randomIndex];
    }

    async initializeWeb3() {
        const providers = [];
        for (const rpcEndpoint of this.config.rpcEndpoints) {
            const isWebSocket = rpcEndpoint.startsWith('ws');
            const Provider = isWebSocket
                ? ethers.providers.WebSocketProvider
                : ethers.providers.JsonRpcProvider;
            const priority = isWebSocket ? WS_RPC_PROVIDER_PRIORITY : HTTP_RPC_PROVIDER_PRIORITY;

            try {
                const provider = new Provider(rpcEndpoint);
                // eslint-disable-next-line no-await-in-loop
                await provider.getNetwork();

                providers.push({
                    provider,
                    priority,
                    weight: 1,
                    stallTimeout: RPC_PROVIDER_STALL_TIMEOUT,
                });

                this.logger.debug(
                    `Connected to the blockchain RPC: ${this.maskRpcUrl(rpcEndpoint)}.`,
                );
            } catch (e) {
                this.logger.warn(
                    `Unable to connect to the blockchain RPC: ${this.maskRpcUrl(rpcEndpoint)}.`,
                );
            }
        }

        try {
            this.provider = new ethers.providers.FallbackProvider(
                providers,
                FALLBACK_PROVIDER_QUORUM,
            );

            // eslint-disable-next-line no-await-in-loop
            await this.providerReady();
        } catch (e) {
            throw new Error(
                `RPC Fallback Provider initialization failed. Fallback Provider quorum: ${FALLBACK_PROVIDER_QUORUM}. Error: ${e.message}.`,
            );
        }

        this.operationalWallets = this.getValidOperationalWallets();
        if (this.operationalWallets.length === 0) {
            throw Error(
                'Unable to initialize web3 service, all operational wallets provided are invalid',
            );
        }
    }

    async initializeContracts() {
        this.contracts = {};
        this.contractAddresses = {};

        this.logger.info(
            `Initializing contracts with hub contract address: ${this.config.hubContractAddress}`,
        );
        this.contracts.Hub = new ethers.Contract(
            this.config.hubContractAddress,
            ABIs.Hub,
            this.operationalWallets[0],
        );
        this.contractAddresses[this.config.hubContractAddress] = this.contracts.Hub;

        const contractsArray = await this.callContractFunction(
            this.contracts.Hub,
            'getAllContracts',
            [],
        );

        contractsArray.forEach(([contractName, contractAddress]) => {
            this.initializeContract(contractName, contractAddress);
        });

        this.assetStorageContracts = {};
        const assetStoragesArray = await this.callContractFunction(
            this.contracts.Hub,
            'getAllAssetStorages',
            [],
        );
        assetStoragesArray.forEach(([, assetStorageAddress]) => {
            this.initializeAssetStorageContract(assetStorageAddress);
        });

        this.logger.info(`Contracts initialized`);

        await this.logBalances();
    }

    initializeProviderDebugging() {
        this.provider.on('debug', (info) => {
            const { method } = info.request;

            if (['call', 'estimateGas'].includes(method)) {
                const contractInstance = this.contractAddresses[info.request.params.transaction.to];
                const inputData = info.request.params.transaction.data;
                const decodedInputData = this._decodeInputData(
                    inputData,
                    contractInstance.interface,
                );
                const functionFragment = contractInstance.interface.getFunction(
                    inputData.slice(0, 10),
                );
                const functionName = functionFragment.name;
                const inputs = functionFragment.inputs
                    .map((input, i) => {
                        const argName = input.name;
                        const argValue = this._formatArgument(decodedInputData[i]);
                        return `${argName}=${argValue}`;
                    })
                    .join(', ');
                if (info.backend.error) {
                    const decodedErrorData = this._decodeErrorData(
                        info.backend.error,
                        contractInstance.interface,
                    );
                    this.logger.debug(
                        `${functionName}(${inputs})  ${method} has failed; Error: ${decodedErrorData}; ` +
                            `RPC: ${this.maskRpcUrl(info.backend.provider.connection.url)}.`,
                    );
                } else if (info.backend.result !== undefined) {
                    let message = `${functionName}(${inputs}) ${method} has been successfully executed; `;

                    if (info.backend.result !== null && method !== 'estimateGas') {
                        try {
                            const decodedResultData = this._decodeResultData(
                                inputData.slice(0, 10),
                                info.backend.result,
                                contractInstance.interface,
                            );
                            message += `Result: ${decodedResultData}; `;
                        } catch (error) {
                            this.logger.warn(
                                `Unable to decode result data for. Message: ${message}`,
                            );
                        }
                    }

                    message += `RPC: ${this.maskRpcUrl(info.backend.provider.connection.url)}.`;

                    this.logger.debug(message);
                }
            }
        });
    }

    maskRpcUrl(url) {
        if (url.includes('apiKey')) {
            return url.split('apiKey')[0];
        }
        return url;
    }

    initializeAssetStorageContract(assetStorageAddress) {
        this.assetStorageContracts[assetStorageAddress.toLowerCase()] = new ethers.Contract(
            assetStorageAddress,
            ABIs.KnowledgeCollectionStorage,
            this.operationalWallets[0],
        );
        this.contractAddresses[assetStorageAddress] =
            this.assetStorageContracts[assetStorageAddress.toLowerCase()];
    }

    setContractCallCache(contractName, functionName, value) {
        if (CACHED_FUNCTIONS[contractName]?.[functionName]) {
            const type = CACHED_FUNCTIONS[contractName][functionName];
            if (!this.contractCallCache[contractName]) {
                this.contractCallCache[contractName] = {};
            }
            switch (type) {
                case CACHE_DATA_TYPES.NUMBER:
                    this.contractCallCache[contractName][functionName] = Number(value);
                    break;
                default:
                    this.contractCallCache[contractName][functionName] = value;
            }
        }
    }

    getContractCallCache(contractName, functionName) {
        if (
            CACHED_FUNCTIONS[contractName]?.[functionName] &&
            this.contractCallCache[contractName]?.[functionName]
        ) {
            return this.contractCallCache[contractName][functionName];
        }
        return null;
    }

    initializeContract(contractName, contractAddress) {
        if (ABIs[contractName] != null) {
            this.contracts[contractName] = new ethers.Contract(
                contractAddress,
                ABIs[contractName],
                this.operationalWallets[0],
            );
            this.contractAddresses[contractAddress] = this.contracts[contractName];
        }
    }

    getContractAddress(contractName) {
        const contract = this.contracts[contractName];

        if (!contract) {
            return null;
        }

        return contract.address;
    }

    async providerReady() {
        return this.provider.getNetwork();
    }

    getPublicKeys() {
        return this.operationalWallets.map((wallet) => wallet.address);
    }

    getManagementKey() {
        return this.config.evmManagementWalletPublicKey;
    }

    async logBalances() {
        for (const wallet of this.operationalWallets) {
            // eslint-disable-next-line no-await-in-loop
            const nativeBalance = await this.getNativeTokenBalance(wallet);
            // eslint-disable-next-line no-await-in-loop
            const tokenBalance = await this.getTokenBalance(wallet.address);
            this.logger.info(
                `Balance of ${wallet.address} is ${nativeBalance} ${this.baseTokenTicker} and ${tokenBalance} ${this.tracTicker}.`,
            );
        }
    }

    async getNativeTokenBalance(wallet) {
        const nativeBalance = await wallet.getBalance();
        return Number(ethers.utils.formatEther(nativeBalance));
    }

    async getTokenBalance(publicKey) {
        const tokenBalance = await this.callContractFunction(this.contracts.Token, 'balanceOf', [
            publicKey,
        ]);
        return Number(ethers.utils.formatEther(tokenBalance));
    }

    async getBlockNumber() {
        const latestBlock = await this.provider.getBlock('latest');
        return latestBlock.number;
    }

    async getIdentityId() {
        if (this.identityId) {
            return this.identityId;
        }

        const promises = this.operationalWallets.map((wallet) =>
            this.callContractFunction(
                this.contracts.IdentityStorage,
                'getIdentityId',
                [wallet.address],
                CONTRACTS.IDENTITY_STORAGE,
            ).then((identityId) => [wallet.address, Number(identityId)]),
        );
        const results = await Promise.all(promises);

        this.identityId = 0;
        const walletWithIdentityZero = [];
        results.forEach(([publicKey, identityId]) => {
            this.logger.trace(
                `Identity id: ${identityId} found for wallet: ${publicKey} on blockchain: ${this.getBlockchainId()}`,
            );
            if (identityId !== 0) {
                if (this.identityId !== identityId && this.identityId !== 0) {
                    const index = this.operationalWallets.find(
                        (wallet) => wallet.address === publicKey,
                    );
                    this.operationalWallets.splice(index, 1);
                    this.logger.warn(
                        `Found invalid identity id. Identity id: ${identityId} found for wallet: ${publicKey}, expected identity id: ${
                            this.identityId
                        } on blockchain: ${this.getBlockchainId()}. Operational wallet will not be used for transactions.`,
                    );
                    this.removeTransactionQueue(publicKey);
                } else {
                    this.identityId = identityId;
                }
            } else {
                walletWithIdentityZero.push(publicKey);
            }
        });

        if (this.identityId !== 0) {
            walletWithIdentityZero.forEach((publicKey) => {
                const index = this.operationalWallets.find(
                    (wallet) => wallet.address === publicKey,
                );
                this.operationalWallets.splice(index, 1);
                this.logger.warn(
                    `Operational wallet: ${publicKey} don't have profile connected to it, expected identity id: ${
                        this.identityId
                    } on blockchain ${this.getBlockchainId()}`,
                );
            });
        }

        if (this.operationalWallets.length === 0) {
            throw new Error(
                `Unable to find valid operational wallets for blockchain implementation: ${this.getBlockchainId()}`,
            );
        }

        return this.identityId;
    }

    async identityIdExists() {
        const identityId = await this.getIdentityId();

        return !!identityId;
    }

    async createProfile(peerId) {
        if (!this.config.nodeName) {
            throw new Error(
                'Missing nodeName in blockchain configuration. Please add it and start the node again.',
            );
        }

        const maxNumberOfRetries = 3;
        let retryCount = 0;
        let profileCreated = false;
        const retryDelayInSec = 12;
        while (retryCount + 1 <= maxNumberOfRetries && !profileCreated) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await this._executeContractFunction(
                    this.contracts.Profile,
                    'createProfile',
                    [
                        this.getManagementKey(),
                        this.getPublicKeys().slice(1),
                        this.config.nodeName,
                        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(peerId)),
                        this.config.operatorFee,
                    ],
                    null,
                    this.operationalWallets[0],
                );
                this.logger.info(
                    `Profile created with name: ${this.config.nodeName}, wallet: ${
                        this.operationalWallets[0].address
                    }, on blockchain ${this.getBlockchainId()}`,
                );
                profileCreated = true;
            } catch (error) {
                if (error.message.includes('Profile already exists')) {
                    this.logger.info(
                        `Skipping profile creation, already exists on blockchain ${this.getBlockchainId()}.`,
                    );
                    profileCreated = true;
                } else if (retryCount + 1 < maxNumberOfRetries) {
                    retryCount += 1;
                    this.logger.warn(
                        `Unable to create profile. Will retry in ${retryDelayInSec}s. Retries left: ${
                            maxNumberOfRetries - retryCount
                        } on blockchain ${this.getBlockchainId()}. Error: ${error}`,
                    );
                    // eslint-disable-next-line no-await-in-loop
                    await sleep(retryDelayInSec * 1000);
                } else {
                    throw error;
                }
            }
        }
    }

    async getGasPrice() {
        try {
            const response = await axios.get(this.config.gasPriceOracleLink);
            const gasPriceRounded = Math.round(response.data.standard.maxFee * 1e9);
            return gasPriceRounded;
        } catch (error) {
            return undefined;
        }
    }

    async callContractFunction(contractInstance, functionName, args, contractName = null) {
        const maxNumberOfRetries = 3;
        const retryDelayInSec = 12;
        let retryCount = 0;
        let result = this.getContractCallCache(contractName, functionName);
        try {
            if (!result) {
                while (retryCount < maxNumberOfRetries) {
                    result = await contractInstance[functionName](...args);
                    const resultIsValid = Web3ServiceValidator.validateResult(
                        functionName,
                        contractName,
                        result,
                        this.logger,
                    );
                    if (resultIsValid) {
                        this.setContractCallCache(contractName, functionName, result);
                        return result;
                    }
                    if (retryCount === maxNumberOfRetries - 1) {
                        return null;
                    }
                    await sleep(retryDelayInSec * 1000);
                    retryCount += 1;
                }
            }
        } catch (error) {
            this._decodeContractCallError(contractInstance, functionName, error, args);
        }
        return result;
    }

    async _executeContractFunction(
        contractInstance,
        functionName,
        args,
        predefinedGasPrice,
        operationalWallet,
    ) {
        let result;
        const gasPrice = predefinedGasPrice ?? (await this.getGasPrice());
        let gasLimit;

        try {
            /* eslint-disable no-await-in-loop */
            gasLimit = await contractInstance.estimateGas[functionName](...args);
        } catch (error) {
            this._decodeEstimateGasError(contractInstance, functionName, error, args);
        }

        gasLimit = gasLimit ?? ethers.utils.parseUnits('900', 'kwei');

        const gasLimitMultiplier = CONTRACT_FUNCTION_GAS_LIMIT_INCREASE_FACTORS[functionName] ?? 1;

        gasLimit = gasLimit.mul(gasLimitMultiplier * 100).div(100);

        this.logger.debug(
            `Sending signed transaction ${functionName} to the blockchain ${this.getBlockchainId()}` +
                ` with gas limit: ${gasLimit.toString()} and gasPrice ${gasPrice.toString()}. ` +
                `Transaction queue length: ${this.getTotalTransactionQueueLength()}. Wallet used: ${
                    operationalWallet.address
                }`,
        );

        const tx = await contractInstance.connect(operationalWallet)[functionName](...args, {
            gasPrice,
            gasLimit,
        });

        try {
            result = await this.provider.waitForTransaction(
                tx.hash,
                TRANSACTION_CONFIRMATIONS,
                TRANSACTION_POLLING_TIMEOUT_MILLIS,
            );

            if (result.status === 0) {
                await this.provider.call(tx, tx.blockNumber);
            }
        } catch (error) {
            this._decodeWaitForTxError(contractInstance, functionName, error, args);
        }
        return result;
    }

    _decodeEstimateGasError(contractInstance, functionName, error, args) {
        try {
            const decodedErrorData = this._decodeErrorData(error, contractInstance.interface);

            if (error.transaction === undefined) {
                throw new Error(
                    `Gas estimation for ${functionName} has failed, reason: ${decodedErrorData}`,
                );
            }

            const functionFragment = contractInstance.interface.getFunction(
                error.transaction.data.slice(0, 10),
            );
            const inputs = functionFragment.inputs
                .map((input, i) => {
                    const argName = input.name;
                    const argValue = this._formatArgument(args[i]);
                    return `${argName}=${argValue}`;
                })
                .join(', ');

            throw new Error(
                `Gas estimation for ${functionName}(${inputs}) has failed, reason: ${decodedErrorData}`,
            );
        } catch (decodeError) {
            this.logger.warn(`Unable to decode estimate gas error: ${decodeError}`);
            throw error;
        }
    }

    _decodeWaitForTxError(contractInstance, functionName, error, args) {
        try {
            const decodedErrorData = this._decodeErrorData(error, contractInstance.interface);

            let sigHash;
            if (error.transaction) {
                sigHash = error.transaction.data.slice(0, 10);
            } else {
                sigHash = this._getFunctionSighash(contractInstance, functionName, args);
            }

            const functionFragment = contractInstance.interface.getFunction(sigHash);
            const inputs = functionFragment.inputs
                .map((input, i) => {
                    const argName = input.name;
                    const argValue = this._formatArgument(args[i]);
                    return `${argName}=${argValue}`;
                })
                .join(', ');

            throw new Error(
                `Transaction ${functionName}(${inputs}) has been reverted, reason: ${decodedErrorData}`,
            );
        } catch (decodeError) {
            this.logger.warn(`Unable to decode wait for transaction error: ${decodeError}`);
            throw error;
        }
    }

    _decodeContractCallError(contractInstance, functionName, error, args) {
        try {
            const decodedErrorData = this._decodeErrorData(error, contractInstance.interface);

            const functionFragment = contractInstance.interface.getFunction(
                error.transaction.data.slice(0, 10),
            );
            const inputs = functionFragment.inputs
                .map((input, i) => {
                    const argName = input.name;
                    const argValue = this._formatArgument(args[i]);
                    return `${argName}=${argValue}`;
                })
                .join(', ');

            throw new Error(`Call ${functionName}(${inputs}) failed, reason: ${decodedErrorData}`);
        } catch (decodeError) {
            this.logger.warn(`Unable to decode contract call error: ${decodeError}`);
            throw error;
        }
    }

    _getFunctionSighash(contractInstance, functionName, args) {
        const functions = Object.keys(contractInstance.interface.functions)
            .filter((key) => contractInstance.interface.functions[key].name === functionName)
            .map((key) => ({ signature: key, ...contractInstance.interface.functions[key] }));

        for (const func of functions) {
            try {
                // Checks if given arguments can be encoded with function ABI inputs
                // may be useful for overloaded functions as it would help to find
                // needed function fragment
                ethers.utils.defaultAbiCoder.encode(func.inputs, args);

                const sighash = ethers.utils.hexDataSlice(
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes(func.signature)),
                    0,
                    4,
                );

                return sighash;
            } catch (error) {
                continue;
            }
        }

        throw new Error('No matching function signature found');
    }

    _getErrorData(error) {
        let nestedError = error;
        while (nestedError && nestedError.error) {
            nestedError = nestedError.error;
        }
        const errorData = nestedError.data;

        if (errorData === undefined) {
            throw error;
        }

        let returnData = typeof errorData === 'string' ? errorData : errorData.data;

        if (typeof returnData === 'object' && returnData.data) {
            returnData = returnData.data;
        }

        if (returnData === undefined || typeof returnData !== 'string') {
            throw error;
        }

        return returnData;
    }

    _decodeInputData(inputData, contractInterface) {
        if (inputData === ZERO_PREFIX) {
            return 'Empty input data.';
        }

        return contractInterface.decodeFunctionData(inputData.slice(0, 10), inputData);
    }

    _decodeErrorData(evmError, contractInterface) {
        let errorData;

        try {
            errorData = this._getErrorData(evmError);
        } catch (error) {
            return error.message;
        }

        // Handle empty error data
        if (errorData === ZERO_PREFIX) {
            return 'Empty error data.';
        }

        // Handle standard solidity string error
        if (errorData.startsWith(SOLIDITY_ERROR_STRING_PREFIX)) {
            const encodedReason = errorData.slice(SOLIDITY_ERROR_STRING_PREFIX.length);
            try {
                return ethers.utils.defaultAbiCoder.decode(['string'], `0x${encodedReason}`)[0];
            } catch (error) {
                return error.message;
            }
        }

        // Handle solidity panic code
        if (errorData.startsWith(SOLIDITY_PANIC_CODE_PREFIX)) {
            const encodedReason = errorData.slice(SOLIDITY_PANIC_CODE_PREFIX.length);
            let code;
            try {
                [code] = ethers.utils.defaultAbiCoder.decode(['uint256'], `0x${encodedReason}`);
            } catch (error) {
                return error.message;
            }

            return SOLIDITY_PANIC_REASONS[code] ?? 'Unknown Solidity panic code.';
        }

        // Try parsing a custom error using the contract ABI
        try {
            const decodedCustomError = contractInterface.parseError(errorData);
            const formattedArgs = decodedCustomError.errorFragment.inputs
                .map((input, i) => {
                    const argName = input.name;
                    const argValue = this._formatArgument(decodedCustomError.args[i]);
                    return `${argName}=${argValue}`;
                })
                .join(', ');
            return `custom error ${decodedCustomError.name}(${formattedArgs})`;
        } catch (error) {
            return `Failed to decode custom error data. Error: ${error}`;
        }
    }

    _decodeResultData(fragment, resultData, contractInterface) {
        if (resultData === ZERO_PREFIX) {
            return 'Empty input data.';
        }

        return contractInterface.decodeFunctionResult(fragment, resultData);
    }

    _formatArgument(value) {
        if (value === null || value === undefined) {
            return 'null';
        }

        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'number' || BigNumber.isBigNumber(value)) {
            return value.toString();
        }

        if (Array.isArray(value)) {
            return `[${value.map((v) => this._formatArgument(v)).join(', ')}]`;
        }

        if (typeof value === 'object') {
            const formattedEntries = Object.entries(value).map(
                ([k, v]) => `${k}: ${this._formatArgument(v)}`,
            );
            return `{${formattedEntries.join(', ')}}`;
        }

        return value.toString();
    }

    async isAssetStorageContract(contractAddress) {
        return this.callContractFunction(this.contracts.Hub, 'isAssetStorage(address)', [
            contractAddress,
        ]);
    }

    async getKnowledgeCollectionMerkleRootByIndex(
        assetStorageContractAddress,
        knowledgeCollectionId,
        index,
    ) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetStorageContractAddress.toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');

        return this.callContractFunction(assetStorageContractInstance, 'getMerkleRootByIndex', [
            knowledgeCollectionId,
            index,
        ]);
    }

    async getKnowledgeCollectionLatestMerkleRoot(
        assetStorageContractAddress,
        knowledgeCollectionId,
    ) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetStorageContractAddress.toString().toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');

        return this.callContractFunction(assetStorageContractInstance, 'getLatestMerkleRoot', [
            knowledgeCollectionId,
        ]);
    }

    async getLatestKnowledgeCollectionId(assetStorageContractAddress) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetStorageContractAddress.toString().toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');

        const lastKnowledgeCollectionId = await this.callContractFunction(
            assetStorageContractInstance,
            'getLatestKnowledgeCollectionId',
            [],
        );
        return lastKnowledgeCollectionId;
    }

    getAssetStorageContractAddresses() {
        return Object.keys(this.assetStorageContracts);
    }

    async getKnowledgeCollectionMerkleRoots(assetStorageContractAddress, tokenId) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetStorageContractAddress.toString().toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');

        return this.callContractFunction(assetStorageContractInstance, 'getMerkleRoots', [tokenId]);
    }

    // async getKnowledgeAssetOwner(assetContractAddress, tokenId) {
    //     const assetStorageContractInstance =
    //         this.assetStorageContracts[assetContractAddress.toString().toLowerCase()];
    //     if (!assetStorageContractInstance)
    //         throw new Error('Unknown asset storage contract address');

    //     return this.callContractFunction(assetStorageContractInstance, 'ownerOf', [tokenId]);
    // }

    async getLatestMerkleRootPublisher(assetStorageContractAddress, knowledgeCollectionId) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetStorageContractAddress.toString().toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');
        const knowledgeCollectionPublisher = await this.callContractFunction(
            assetStorageContractInstance,
            'getLatestMerkleRootPublisher',
            [knowledgeCollectionId],
        );
        return knowledgeCollectionPublisher;
    }

    async getKnowledgeCollectionSize(assetStorageContractAddress, knowledgeCollectionId) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetStorageContractAddress.toString().toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');
        const knowledgeCollectionSize = await this.callContractFunction(
            assetStorageContractInstance,
            'getByteSize',
            [knowledgeCollectionId],
        );
        return Number(knowledgeCollectionSize);
    }

    async getKnowledgeAssetsRange(assetStorageContractAddress, knowledgeCollectionId) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetStorageContractAddress.toString().toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');
        const knowledgeAssetsRange = await this.callContractFunction(
            assetStorageContractInstance,
            'getKnowledgeAssetsRange',
            [knowledgeCollectionId],
        );
        return {
            startTokenId: Number(
                knowledgeAssetsRange[0]
                    .sub(BigNumber.from(knowledgeCollectionId - 1).mul('0x0f4240'))
                    .toString(),
            ),
            endTokenId: Number(
                knowledgeAssetsRange[1]
                    .sub(BigNumber.from(knowledgeCollectionId - 1).mul('0x0f4240'))
                    .toString(),
            ),
            burned: knowledgeAssetsRange[2].map((burned) =>
                Number(
                    burned
                        .sub(BigNumber.from(knowledgeCollectionId - 1).mul('0x0f4240'))
                        .toString(),
                ),
            ),
        };
    }

    async getMinimumStake() {
        const minimumStake = await this.callContractFunction(
            this.contracts.ParametersStorage,
            'minimumStake',
            [],
            CONTRACTS.PARAMETERS_STORAGE,
        );

        return Number(ethers.utils.formatEther(minimumStake));
    }

    async getMaximumStake() {
        const maximumStake = await this.callContractFunction(
            this.contracts.ParametersStorage,
            'maximumStake',
            [],
            CONTRACTS.PARAMETERS_STORAGE,
        );

        return Number(ethers.utils.formatEther(maximumStake));
    }

    async getShardingTableHead() {
        return this.callContractFunction(this.contracts.ShardingTableStorage, 'head', []);
    }

    async getShardingTableLength() {
        const nodesCount = await this.callContractFunction(
            this.contracts.ShardingTableStorage,
            'nodesCount',
            [],
        );
        return Number(nodesCount);
    }

    async getShardingTablePage(startingIdentityId, nodesNum) {
        return this.callContractFunction(
            this.contracts.ShardingTable,
            'getShardingTable(uint72,uint72)',
            [startingIdentityId, nodesNum],
        );
    }

    getBlockchainId() {
        return this.getImplementationName();
    }

    async healthCheck() {
        try {
            const gasPrice = await this.operationalWallets[0].getGasPrice();
            if (gasPrice) return true;
        } catch (e) {
            this.logger.error(`Error on checking blockchain. ${e}`);
            return false;
        }
        return false;
    }

    async restartService() {
        await this.initializeWeb3();
        await this.initializeContracts();
    }

    async getBlockchainTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    async getLatestBlock() {
        const currentBlock = await this.provider.getBlockNumber();
        const blockTimestamp = await this.provider.getBlock(currentBlock);
        return blockTimestamp;
    }

    async getParanetKnowledgeCollectionCount(paranetId) {
        return this.callContractFunction(
            this.contracts.ParanetsRegistry,
            'getKnowledgeCollectionsCount',
            [paranetId],
        );
    }

    async getParanetKnowledgeCollectionLocatorsWithPagination(paranetId, offset, limit) {
        return this.callContractFunction(
            this.contracts.Paranet,
            'getKnowledgeCollectionLocatorsWithPagination',
            [paranetId, offset, limit],
        );
    }

    async getParanetMetadata(paranetId) {
        return this.callContractFunction(
            this.contracts.ParanetsRegistry,
            'getParanetMetadata',
            [paranetId],
            CONTRACTS.PARANETS_REGISTRY,
        );
    }

    async getParanetName(paranetId) {
        return this.callContractFunction(
            this.contracts.ParanetsRegistry,
            'getName',
            [paranetId],
            CONTRACTS.PARANETS_REGISTRY,
        );
    }

    async getDescription(paranetId) {
        return this.callContractFunction(
            this.contracts.ParanetsRegistry,
            'getDescription',
            [paranetId],
            CONTRACTS.PARANETS_REGISTRY,
        );
    }

    async paranetExists(paranetId) {
        return this.callContractFunction(
            this.contracts.ParanetsRegistry,
            'paranetExists',
            [paranetId],
            CONTRACTS.PARANETS_REGISTRY,
        );
    }

    async isCuratedNode(paranetId, identityId) {
        return this.callContractFunction(this.contracts.ParanetsRegistry, 'isCuratedNode', [
            paranetId,
            identityId,
        ]);
    }

    async getNodesAccessPolicy(paranetId) {
        return this.callContractFunction(this.contracts.ParanetsRegistry, 'getNodesAccessPolicy', [
            paranetId,
        ]);
    }

    async getParanetCuratedNodes(paranetId) {
        return this.callContractFunction(
            this.contracts.ParanetsRegistry,
            'getCuratedNodes',
            [paranetId],
            CONTRACTS.PARANETS_REGISTRY,
        );
    }

    async getNodeId(identityId) {
        return this.callContractFunction(this.contracts.ProfileStorage, 'getNodeId', [identityId]);
    }

    async signMessage(messageHash) {
        const wallet = this.getRandomOperationalWallet();
        return wallet.signMessage(ethers.utils.arrayify(messageHash));
    }

    async getStakeWeightedAverageAsk() {
        return this.callContractFunction(
            this.contracts.AskStorage,
            'getStakeWeightedAverageAsk',
            [],
        );
    }

    async getTimeUntilNextEpoch() {
        return this.callContractFunction(this.contracts.Chronos, 'timeUntilNextEpoch', []);
    }

    async getEpochLength() {
        return this.callContractFunction(this.contracts.Chronos, 'epochLength', []);
    }
    // SUPPORT FOR OLD CONTRACTS

    async getLatestAssertionId(assetContractAddress, tokenId) {
        const assetStorageContractInstance =
            this.assetStorageContracts[assetContractAddress.toString().toLowerCase()];
        if (!assetStorageContractInstance)
            throw new Error('Unknown asset storage contract address');

        return this.callContractFunction(assetStorageContractInstance, 'getLatestAssertionId', [
            tokenId,
        ]);
    }
}

export default Web3Service;
