/* eslint-disable max-len */

import { ethers } from 'ethers';
import { readFile } from 'fs/promises';
import { exec, execSync } from 'child_process';

const Hub = JSON.parse((await readFile('node_modules/dkg-evm-module/abi/Hub.json')).toString());
const ParametersStorage = JSON.parse(
    (await readFile('node_modules/dkg-evm-module/abi/ParametersStorage.json')).toString(),
);

const ParametersStorageInterface = new ethers.utils.Interface(ParametersStorage);

const hubContractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const testParametersStorageParams = {
    epochLength: 6 * 60, // 6 minutes
    commitWindowDurationPerc: 33, // 2 minutes
    minProofWindowOffsetPerc: 66, // 4 minutes
    maxProofWindowOffsetPerc: 66, // 4 minutes
    proofWindowDurationPerc: 33, // 2 minutes
    updateCommitWindowDuration: 60, // 1 minute
    finalizationCommitsNumber: 3,
    r0: 3,
    r1: 5,
    r2: 6,
};
/**
 * LocalBlockchain represent small wrapper around the Ganache.
 *
 * LocalBlockchain uses the Ganache-core to run in-memory blockchain simulator. It uses
 * predefined accounts that can be fetch by calling LocalBlockchain.wallets(). Account with
 * index 7 is used for deploying contracts.
 *
 * Basic usage:
 * LocalBlockchain.wallets()[9].instance.address
 * LocalBlockchain.wallets()[9].privateKey,
 *
 * const localBlockchain = new LocalBlockchain({ logger: this.logger });
 * await localBlockchain.initialize(); // Init the server.
 * // That will compile and deploy contracts. Later can be called
 * // deployContracts() to re-deploy fresh contracts.
 *
 * // After usage:
 *     if (localBlockchain.server) {
 *         this.state.localBlockchain.server.close();
 *     }
 *
 * @param {String} [options.logger] - Logger instance with debug, trace, info and error methods.
 */

let startBlockchainProcess;

class LocalBlockchain {
    constructor() {
        this.ParametersStorageInterface = ParametersStorageInterface;
    }

    async initialize(port, _console = console, version = '') {
        this.port = port;
        startBlockchainProcess = exec(`npm run start:local_blockchain${version} -- ${port}`);
        startBlockchainProcess.stdout.on('data', (data) => {
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

        await this.provider.ready;
    }

    async stop() {
        const commandLog = await execSync(`npm run kill:local_blockchain -- ${this.port}`);
        console.log(`Killing hardhat process: ${commandLog.toString()}`);
        startBlockchainProcess.kill();
    }

    getWallets() {
        return this.wallets;
    }

    async setParametersStorageParams(parametersStorageAddress, params) {
        for (const parameter of Object.keys(params)) {
            const blockchainMethodName = `set${parameter.charAt(0).toUpperCase() + parameter.slice(1)}`;
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
        console.log("PARANET "+ this.ParametersStorageInterface);

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