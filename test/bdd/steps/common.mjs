import { Given, Then } from '@cucumber/cucumber';
import { expect, assert } from 'chai';
import fs from 'fs';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';

import DkgClientHelper from '../../utilities/dkg-client-helper.mjs';
import StepsUtils from '../../utilities/steps-utils.mjs';
import FileService from '../../../src/service/file-service.js';
import MockOTNode from '../../utilities/MockOTNode.mjs';

const stepsUtils = new StepsUtils();

Given(
    /^I setup (\d+)[ additional]* node[s]*$/,
    { timeout: 30000 },
    function nodeSetup(nodeCount, done) {
        this.logger.log(`I setup ${nodeCount} node${nodeCount !== 1 ? 's' : ''}`);

        const currentNumberOfNodes = Object.keys(this.state.nodes).length;
        let nodesStarted = 0;
        for (let i = 0; i < nodeCount; i += 1) {
            const nodeIndex = currentNumberOfNodes + i;
            const blockchains = [];
            Object.keys(this.state.localBlockchains).forEach((blockchainId) => {
                const blockchain = this.state.localBlockchains[blockchainId];
                const wallets = blockchain.getWallets();
                blockchains.push({
                    blockchainId,
                    operationalWallet: wallets[nodeIndex],
                    managementWallet: wallets[nodeIndex + Math.floor(wallets.length / 2)],
                    port: blockchain.port
                })
            });
            const rpcPort = 8901 + nodeIndex;
            const networkPort = 9001 + nodeIndex;
            const nodeName = `origintrail-test-${nodeIndex}`;
            // const sharesTokenName = `origintrail-test-${nodeIndex}`;
            // const sharesTokenSymbol = `OT-T-${nodeIndex}`;
            // const sharesTokenName = `origintrail-test-${nodeIndex}`;
            // const sharesTokenSymbol = `OT-T-${nodeIndex}`;
            const nodeConfiguration = stepsUtils.createNodeConfiguration(
                blockchains,
                nodeIndex,
                nodeName,
                rpcPort,
                networkPort,
                // sharesTokenName,
                // sharesTokenSymbol,
                // sharesTokenName,
                // sharesTokenSymbol,
            );
            const forkedNode = stepsUtils.forkNode(nodeConfiguration);
            const logFileStream = fs.createWriteStream(
                `${this.state.scenarionLogDir}/${nodeName}.log`,
            );
            forkedNode.stdout.setEncoding('utf8');
            forkedNode.stdout.on('data', (data) => {
                // Here is where the output goes
                logFileStream.write(data);
            });
            // eslint-disable-next-line no-loop-func
            forkedNode.on('message', (response) => {
                if (response.error) {
                    assert.fail(`Error while initializing node${nodeIndex}: ${response.error}`);
                } else {
                    // todo if started
                    const client = new DkgClientHelper({
                        endpoint: 'http://localhost',
                        port: rpcPort,
                        maxNumberOfRetries: 5,
                        frequency: 2,
                        contentType: 'all',
                    });
                    let clientBlockchainOptions = {};
                    Object.keys(this.state.localBlockchains).forEach((blockchainId, index) => {
                        const blockchain = this.state.localBlockchains[blockchainId];
                        const wallets = blockchain.getWallets();
                        clientBlockchainOptions[blockchainId] = {
                            blockchain: {
                                name: blockchainId,
                                publicKey: wallets[index].address,
                                privateKey: wallets[index].privateKey,
                                rpc: `http://localhost:${blockchain.port}`,
                                hubContract: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                            },
                        };
                    });

                    this.state.nodes[nodeIndex] = {
                        client,
                        forkedNode,
                        configuration: nodeConfiguration,
                        nodeRpcUrl: `http://localhost:${rpcPort}`,
                        fileService: new FileService({
                            config: nodeConfiguration,
                            logger: this.logger,
                        }),
                        clientBlockchainOptions,
                    };
                }
                nodesStarted += 1;
                if (nodesStarted === nodeCount) {
                    done();
                }
            });
        }
    },
);

Given(
    /^(\d+) bootstrap is running$/,
    { timeout: 60000 },
    async function bootstrapRunning(nodeCount) {
        expect(this.state.bootstraps).to.have.length(0);
        expect(nodeCount).to.be.equal(1); // only one supported currently

        this.logger.log('Initializing bootstrap node');
        const nodeIndex = Object.keys(this.state.nodes).length;

        const blockchains = [];
        for (const blockchainId of Object.keys(this.state.localBlockchains)) {
            const blockchain = this.state.localBlockchains[blockchainId];
            const wallets = blockchain.getWallets();
            blockchains.push({
                blockchainId,
                operationalWallet: wallets[0],
                managementWallet: wallets[Math.floor(wallets.length / 2)],
                port: blockchain.port,
            });
        }

        const rpcPort = 8900;
        const networkPort = 9000;
        const nodeName = 'origintrail-test-bootstrap';
        const nodeConfiguration = stepsUtils.createNodeConfiguration(
            blockchains,
            nodeIndex,
            nodeName,
            rpcPort,
            networkPort
        );

        const appDataPath = path.join(process.cwd(), nodeConfiguration.appDataPath);
        fs.rmSync(appDataPath, { recursive: true, force: true });

        const nodeInstance = new MockOTNode(nodeConfiguration);
        
        try {
            await nodeInstance.start(); // This will skip startNetworkModule

            // Get the first blockchain for the DKG client config
            const firstBlockchainId = Object.keys(this.state.localBlockchains)[0];
            const firstBlockchain = this.state.localBlockchains[firstBlockchainId];
            const firstWallet = firstBlockchain.getWallets()[0];

            const client = new DkgClientHelper({
                endpoint: 'http://localhost',
                port: rpcPort,
                useSSL: false,
                timeout: 25,
                loglevel: 'trace',
                blockchain: {
                    name: firstBlockchainId,
                    publicKey: firstWallet.address,
                    privateKey: firstWallet.privateKey,
                    rpc: `http://localhost:${firstBlockchain.port}`,
                },
            });

            this.state.bootstraps.push({
                client,
                otNodeInstance: nodeInstance,
                configuration: nodeConfiguration,
                nodeRpcUrl: `http://localhost:${rpcPort}`,
                fileService: nodeInstance.fileService,
            });
        } catch (error) {
            // Ensure node is stopped if there's an error after starting
            this.logger.error(`Error during bootstrap initialization: ${error.message}`);
            if (nodeInstance.stop) {
                await nodeInstance.stop();
            }
            throw error;
        }
    }
);
//
// Given(
//     /^I setup node (\d+) with ([a-z][\w-]*(?:\.[\w-]+)*) set to ([^"]*)$/,
//     { timeout: 120000 },
//     function setupPublishNode(nodeNum, propertyName, propertyValue, done) {
//         const nodeIndex = Object.keys(this.state.nodes).length;
//
//         const blockchains = [];
//
//         Object.keys(this.state.localBlockchains).forEach((blockchainId) => {
//             const blockchain = this.state.localBlockchains[blockchainId];
//             const wallets = blockchain.getWallets();
//             blockchains.push({
//                 blockchainId,
//                 operationalWallet: wallets[nodeIndex],
//                 managementWallet: wallets[nodeIndex + Math.floor(wallets[blockchainId].length / 2)],
//                 port: blockchain.port
//             })
//         });
//         const rpcPort = 8901 + nodeIndex;
//         const networkPort = 9001 + nodeIndex;
//         const nodeName = `origintrail-test-${nodeIndex}`;
//         const sharesTokenName = `origintrail-test-${nodeIndex}`;
//         const sharesTokenSymbol = `OT-T-${nodeIndex}`;
//         const nodeConfiguration = stepsUtils.createNodeConfiguration(
//             blockchains,
//             nodeIndex,
//             nodeName,
//             rpcPort,
//             networkPort,
//             sharesTokenName,
//             sharesTokenSymbol,
//         );
//         const propertyNameSplit = propertyName.split('.');
//         this.logger.log(`I setup node ${nodeNum} with ${propertyName} set to ${propertyValue}`);
//         expect(
//             Object.prototype.hasOwnProperty.call(nodeConfiguration, propertyNameSplit[0]),
//             `Property ${propertyName} doesn't exist`,
//         ).to.be.equal(true);
//         let propName = nodeConfiguration;
//         for (let i = 0; i < propertyNameSplit.length - 1; i += 1) {
//             propName = propName[propertyNameSplit[i]];
//         }
//         if (propName[propertyNameSplit.slice(-1)] !== undefined) {
//             propName[propertyNameSplit.slice(-1)] = propertyValue === '\\0' ? '\0' : propertyValue;
//         } else {
//             assert.fail(`Property ${propertyName} doesn't exist`);
//         }
//         const forkedNode = stepsUtils.forkNode(nodeConfiguration);
//
//         const logFileStream = fs.createWriteStream(`${this.state.scenarionLogDir}/${nodeName}.log`);
//         forkedNode.stdout.setEncoding('utf8');
//         forkedNode.stdout.on('data', (data) => {
//             // Here is where the output goes
//             logFileStream.write(data);
//         });
//
//         // eslint-disable-next-line no-loop-func
//         forkedNode.on('message', (response) => {
//             if (response.error) {
//                 assert.fail(`Error while initializing node${nodeIndex} : ${response.error}`);
//             } else {
//                 const client = new DkgClientHelper({
//                     endpoint: 'http://localhost',
//                     port: rpcPort,
//                     blockchain: {
//                         name: 'hardhat',
//                         publicKey: wallet.address,
//                         privateKey: wallet.privateKey,
//                     },
//                     maxNumberOfRetries: 5,
//                     frequency: 2,
//                     contentType: 'all',
//                 });
//                 this.state.nodes[nodeIndex] = {
//                     client,
//                     forkedNode,
//                     configuration: nodeConfiguration,
//                     nodeRpcUrl: `http://localhost:${rpcPort}`,
//                     fileService: new FileService({
//                         config: nodeConfiguration,
//                         logger: this.logger,
//                     }),
//                 };
//             }
//             done();
//         });
//     },
// );

Then(
    /Latest (Get|Publish|Update) operation finished with status: ([COMPLETED|FAILED|PublishValidateAssertionError|PublishStartError|GetAssertionIdError|GetNetworkError|GetLocalError|PublishRouteError]+)$/,
    { timeout: 120000 },
    async function latestResolveFinishedCall(operationName, status) {
        this.logger.log(`Latest ${operationName} operation finished with status: ${status}`);
        const operationData = `latest${operationName}Data`;
        expect(
            !!this.state[operationData],
            `Latest ${operationName} result is undefined. ${operationData} result not started.`,
        ).to.be.equal(true);
        expect(
            !!this.state[operationData].result,
            `Latest ${operationName} result data result is undefined. ${operationData} result is not finished.`,
        ).to.be.equal(true);

        expect(
            this.state[operationData].errorType ?? this.state[operationData].status,
            `${operationData} result status validation failed`,
        ).to.be.equal(status);
    },
);

Given(/^I wait for (\d+) seconds$/, { timeout: 100000 }, async function waitFor(seconds) {
    this.logger.log(`I wait for ${seconds} seconds for nodes to connect to each other`);
    await sleep(seconds * 1000);
});

Given(
    /^I set R1 to be (\d+) on blockchain ([^"]*)$/,
    { timeout: 100000 },
    async function waitFor(r1, blockchain) {
        if (!this.state.localBlockchains[blockchain]) {
            throw Error(`Unknown blockchain ${blockchain}`);
        }
        this.logger.log(`I set R1 to be ${r1} on blockchain ${blockchain}`);
        await this.state.localBlockchains[blockchain].setR1(r1);
    },
);

Given(
    /^I set R0 to be (\d+) on blockchain ([^"]*)$/,
    { timeout: 100000 },
    async function waitFor(r0, blockchain) {
        if (!this.state.localBlockchains[blockchain]) {
            throw Error(`Unknown blockchain ${blockchain}`);
        }
        this.logger.log(`I set R0 to be ${r0} on blockchain ${blockchain}`);
        await this.state.localBlockchains[blockchain].setR0(r0);
    },
);

Given(
    /^I set finalizationCommitsNumber to be (\d+) on blockchain ([^"]*)$/,
    { timeout: 100000 },
    async function waitFor(finalizationCommitsNumber, blockchain) {
        if (!this.state.localBlockchains[blockchain]) {
            throw Error(`Unknown blockchain ${blockchain}`);
        }
        this.logger.log(
            `I set finalizationCommitsNumber to be ${finalizationCommitsNumber} on blockchain ${blockchain}`,
        );
        await this.state.localBlockchains[blockchain].setFinalizationCommitsNumber(
            finalizationCommitsNumber,
        );
    },
);

Given(/^infrastucture is functional$/, { timeout: 1000 }, async function checkInfrastructure() {
    this.logger.log('Checking if infrastructure is functional');
});

Given(/^Node (\d+) responds to info route$/, { timeout: 20000 }, async function (nodeNumber) {
    const nodeIndex = parseInt(nodeNumber, 10) - 1;
    const response = await this.state.nodes[nodeIndex].client.info();

    this.logger.log(`Node ${nodeNumber} info response: ${JSON.stringify(response)}`);

    assert.ok(response && response.version, 'Expected node info to contain "version" field');
});