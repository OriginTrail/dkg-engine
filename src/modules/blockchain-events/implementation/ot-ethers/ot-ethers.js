/* eslint-disable no-await-in-loop */
import { ethers } from 'ethers';
import BlockchainEventsService from '../blockchain-events-service.js';

import {
    MAXIMUM_NUMBERS_OF_BLOCKS_TO_FETCH,
    MAX_BLOCKCHAIN_EVENT_SYNC_OF_HISTORICAL_BLOCKS_IN_MILLS,
    NODE_ENVIRONMENTS,
    ABIs,
    MONITORED_CONTRACTS,
} from '../../../../constants/constants.js';

class OtEthers extends BlockchainEventsService {
    async initialize(config, logger) {
        await super.initialize(config, logger);
        this.contractCallCache = {};
        await this._initializeRpcProviders();
        await this._initializeContracts();
    }

    async _initializeRpcProviders() {
        this.providers = {};
        for (const blockchain of this.config.blockchains) {
            const validProviders = [];
            for (const rpcEndpoint of this.config.rpcEndpoints[blockchain]) {
                try {
                    const provider = new ethers.providers.JsonRpcProvider(rpcEndpoint);

                    // eslint-disable-next-line no-await-in-loop
                    await provider.getNetwork();
                    validProviders.push(provider);
                } catch (error) {
                    this.logger.error(
                        `Failed to initialize provider: ${rpcEndpoint}. Error: ${error.message}`,
                    );
                }
            }

            if (validProviders.length === 0) {
                throw new Error(`No valid providers found for blockchain: ${blockchain}`);
            }

            this.providers[blockchain] = validProviders;
            this.logger.info(
                `Initialized ${validProviders.length} valid providers for blockchain: ${blockchain}`,
            );
        }
    }

    _getRandomProvider(blockchain) {
        const blockchainProviders = this.providers[blockchain];
        if (!blockchainProviders || blockchainProviders.length === 0) {
            throw new Error(`No providers available for blockchain: ${blockchain}`);
        }
        const randomIndex = Math.floor(Math.random() * blockchainProviders.length);
        return blockchainProviders[randomIndex];
    }

    async _initializeContracts() {
        this.contracts = {};

        for (const blockchain of this.config.blockchains) {
            this.contracts[blockchain] = {};

            this.logger.info(
                `Initializing contracts with hub contract address: ${this.config.hubContractAddress[blockchain]}`,
            );
            this.contracts[blockchain].Hub = this.config.hubContractAddress[blockchain];

            const provider = this._getRandomProvider(blockchain);
            const hubContract = new ethers.Contract(
                this.config.hubContractAddress[blockchain],
                ABIs.Hub,
                provider,
            );

            const contractsAray = await hubContract.getAllContracts();
            const assetStoragesArray = await hubContract.getAllAssetStorages();

            const allContracts = [...contractsAray, ...assetStoragesArray];

            for (const [contractName, contractAddress] of allContracts) {
                if (MONITORED_CONTRACTS.includes(contractName) && ABIs[contractName] != null) {
                    this.contracts[blockchain][contractName] = contractAddress;
                }
            }
        }
    }

    getContractAddress(blockchain, contractName) {
        return this.contracts[blockchain][contractName];
    }

    updateContractAddress(blockchain, contractName, contractAddress) {
        this.contracts[blockchain][contractName] = contractAddress;
    }

    async getBlock(blockchain, tag) {
        const provider = this._getRandomProvider(blockchain);
        return provider.getBlock(tag);
    }

    async getPastEvents(blockchain, contractNames, eventsToFilter, lastCheckedBlock, currentBlock) {
        const maxBlocksToSync = await this._getMaxNumberOfHistoricalBlocksForSync(blockchain);
        let fromBlock =
            currentBlock - lastCheckedBlock > maxBlocksToSync ? currentBlock : lastCheckedBlock + 1;
        const eventsMissed = currentBlock - lastCheckedBlock > maxBlocksToSync;
        if (eventsMissed) {
            return {
                events: [],
                lastCheckedBlock: currentBlock,
                eventsMissed,
            };
        }
        const contractAddresses = [];
        const topics = [];
        const addressToContractNameMap = {};

        for (const contractName of contractNames) {
            const contractAddress = this.contracts[blockchain][contractName];

            if (!contractAddress) {
                continue;
            }

            const provider = this._getRandomProvider(blockchain);
            const contract = new ethers.Contract(contractAddress, ABIs[contractName], provider);
            const contractTopics = [];
            for (const filterName in contract.filters) {
                if (!eventsToFilter.includes(filterName)) {
                    continue;
                }
                const filter = contract.filters[filterName]().topics[0];
                contractTopics.push(filter);
            }

            if (contractTopics.length > 0) {
                contractAddresses.push(contract.address);
                topics.push(...contractTopics);
                addressToContractNameMap[contract.address.toLowerCase()] = contractName;
            }
        }

        const events = [];
        let toBlock = currentBlock;
        try {
            while (fromBlock <= currentBlock) {
                toBlock = Math.min(
                    fromBlock + MAXIMUM_NUMBERS_OF_BLOCKS_TO_FETCH - 1,
                    currentBlock,
                );

                const fromBlockParam = ethers.BigNumber.from(fromBlock)
                    .toHexString()
                    .replace(/^0x0+/, '0x');
                const toBlockParam = ethers.BigNumber.from(toBlock)
                    .toHexString()
                    .replace(/^0x0+/, '0x');
                const provider = this._getRandomProvider(blockchain);
                const newLogs = await provider.send('eth_getLogs', [
                    {
                        address: contractAddresses,
                        fromBlock: fromBlockParam,
                        toBlock: toBlockParam,
                        topics: [topics],
                    },
                ]);
                for (const log of newLogs) {
                    const contractName = addressToContractNameMap[log.address];
                    const contractInterface = new ethers.utils.Interface(ABIs[contractName]);

                    try {
                        const parsedLog = contractInterface.parseLog(log);
                        events.push({
                            blockchain,
                            contract: contractName,
                            contractAddress: log.address,
                            event: parsedLog.name,
                            data: JSON.stringify(
                                Object.fromEntries(
                                    Object.entries(parsedLog.args).map(([k, v]) => [
                                        k,
                                        ethers.BigNumber.isBigNumber(v) ? v.toString() : v,
                                    ]),
                                ),
                            ),
                            blockNumber: parseInt(log.blockNumber, 16),
                            transactionIndex: parseInt(log.transactionIndex, 16),
                            logIndex: parseInt(log.logIndex, 16),
                        });
                    } catch (error) {
                        this.logger.warn(
                            `Failed to parse log for contract: ${contractName}. Error: ${error.message}`,
                        );
                    }
                }

                fromBlock = toBlock + 1;
            }
        } catch (error) {
            this.logger.warn(
                `Unable to process block range from: ${fromBlock} to: ${toBlock} on blockchain: ${blockchain}. Error: ${error.message}`,
            );
        }

        return {
            events,
            eventsMissed,
        };
    }

    async _getMaxNumberOfHistoricalBlocksForSync(blockchain) {
        if (!this.maxNumberOfHistoricalBlocksForSync) {
            if (
                [NODE_ENVIRONMENTS.DEVELOPMENT, NODE_ENVIRONMENTS.TEST].includes(
                    process.env.NODE_ENV,
                )
            ) {
                this.maxNumberOfHistoricalBlocksForSync = Infinity;
            } else {
                const blockTimeMillis = await this._getBlockTimeMillis(blockchain);

                this.maxNumberOfHistoricalBlocksForSync = Math.round(
                    // 60 * 60 * 1000 = 1 hour
                    MAX_BLOCKCHAIN_EVENT_SYNC_OF_HISTORICAL_BLOCKS_IN_MILLS / blockTimeMillis,
                );
            }
        }
        return this.maxNumberOfHistoricalBlocksForSync;
    }

    async _getBlockTimeMillis(blockchain, blockRange = 1000) {
        const latestBlock = await this.getBlock(blockchain);
        const olderBlock = await this.getBlock(blockchain, latestBlock.number - blockRange);

        const timeDiffMillis = (latestBlock.timestamp - olderBlock.timestamp) * 1000;
        return timeDiffMillis / blockRange;
    }
}

export default OtEthers;
