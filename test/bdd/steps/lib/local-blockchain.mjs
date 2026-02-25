import { ethers } from 'ethers';
import { readFile } from 'fs/promises';
import { exec, execSync } from 'child_process';

const Hub = JSON.parse((await readFile('node_modules/dkg-evm-module/abi/Hub.json')).toString());
const ParametersStorage = JSON.parse(
    (await readFile('node_modules/dkg-evm-module/abi/ParametersStorage.json')).toString(),
);

const hubContractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

/**
 * LocalBlockchain wraps a local Hardhat node process for BDD testing.
 *
 * Starts a Hardhat chain via `npm run start:local_blockchain -- <port>`,
 * connects an ethers provider, loads predefined test wallets, and exposes
 * helpers to mutate on-chain ParametersStorage values during scenarios.
 *
 * Basic usage:
 *   const localBlockchain = new LocalBlockchain();
 *   await localBlockchain.initialize(8545, console);
 *   // use localBlockchain.getWallets(), setR0(), setR1(), etc.
 *   await localBlockchain.stop();
 */
class LocalBlockchain {
    async initialize(port, _console = console, version = '') {
        this.port = port;
        this.startBlockchainProcess = exec(
            `npm run start:local_blockchain${version} -- ${port}`,
        );
        this.startBlockchainProcess.stdout.on('data', (data) => {
            _console.log(data);
        });

        this.provider = new ethers.providers.JsonRpcProvider(`http://localhost:${port}`);

        const [privateKeysFile, publicKeysFile] = await Promise.all([
            readFile('test/bdd/steps/api/datasets/privateKeys.json'),
            readFile('test/bdd/steps/api/datasets/publicKeys.json'),
        ]);

        const privateKeys = JSON.parse(privateKeysFile.toString());
        const publicKeys = JSON.parse(publicKeysFile.toString());

        this.wallets = privateKeys.map((privateKey, index) => ({
            address: publicKeys[index],
            privateKey,
        }));

        const wallet = new ethers.Wallet(this.wallets[0].privateKey, this.provider);
        this.hubContract = new ethers.Contract(hubContractAddress, Hub, wallet);
        this.ParametersStorageInterface = new ethers.utils.Interface(ParametersStorage);

        // provider.ready resolves when the JSON-RPC port is open, which happens before Hardhat
        // finishes deploying contracts. Poll the hub contract until it actually responds so that
        // the step only completes once the full on-chain environment is ready.
        await this.provider.ready;
        await this._waitForContracts(port, _console);
    }

    async _waitForContracts(port, _console) {
        const MAX_ATTEMPTS = 60;
        const INTERVAL_MS = 5000;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await this.hubContract.getContractAddress('ParametersStorage');
                _console.log(`Contracts deployed and ready on port ${port}`);
                return;
            } catch {
                _console.log(
                    `Waiting for contracts on port ${port} (attempt ${attempt + 1}/${MAX_ATTEMPTS})…`,
                );
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, INTERVAL_MS));
            }
        }
        throw new Error(
            `Hub contract on port ${port} did not become ready after ${MAX_ATTEMPTS * (INTERVAL_MS / 1000)}s`,
        );
    }

    async stop() {
        const commandLog = execSync(`npm run kill:local_blockchain -- ${this.port}`);
        console.log(`Killing hardhat process: ${commandLog.toString()}`);
        this.startBlockchainProcess.kill();
    }

    getWallets() {
        return this.wallets;
    }

    async setParametersStorageParams(params) {
        const parametersStorageAddress = await this.hubContract.getContractAddress(
            'ParametersStorage',
        );
        for (const parameter of Object.keys(params)) {
            const blockchainMethodName = `set${
                parameter.charAt(0).toUpperCase() + parameter.slice(1)
            }`;
            console.log(`Setting ${parameter} in parameters storage to: ${params[parameter]}`);
            const encodedData = this.ParametersStorageInterface.encodeFunctionData(
                blockchainMethodName,
                [params[parameter]],
            );
            // eslint-disable-next-line no-await-in-loop
            await this.hubContract.forwardCall(parametersStorageAddress, encodedData);
        }
    }

    async setR0(r0) {
        console.log(`Setting R0 in parameters storage to: ${r0}`);
        const encodedData = this.ParametersStorageInterface.encodeFunctionData('setR0', [r0]);
        const parametersStorageAddress = await this.hubContract.getContractAddress(
            'ParametersStorage',
        );
        await this.hubContract.forwardCall(parametersStorageAddress, encodedData);
    }

    async setR1(r1) {
        console.log(`Setting R1 in parameters storage to: ${r1}`);
        const encodedData = this.ParametersStorageInterface.encodeFunctionData('setR1', [r1]);
        const parametersStorageAddress = await this.hubContract.getContractAddress(
            'ParametersStorage',
        );
        await this.hubContract.forwardCall(parametersStorageAddress, encodedData);
    }

    async setFinalizationCommitsNumber(commitsNumber) {
        console.log(`Setting finalizationCommitsNumber in parameters storage to: ${commitsNumber}`);
        const encodedData = this.ParametersStorageInterface.encodeFunctionData(
            'setFinalizationCommitsNumber',
            [commitsNumber],
        );
        const parametersStorageAddress = await this.hubContract.getContractAddress(
            'ParametersStorage',
        );
        await this.hubContract.forwardCall(parametersStorageAddress, encodedData);
    }
}

export default LocalBlockchain;
