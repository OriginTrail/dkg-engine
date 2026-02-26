import { execSync } from 'child_process';
import { Given, Then } from '@cucumber/cucumber';
import { expect, assert } from 'chai';
import fs from 'fs';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';
import mysql from 'mysql2';

import DkgClientHelper from '../../utilities/dkg-client-helper.mjs';
import StepsUtils, {
    BOOTSTRAP_NETWORK_PORT,
    BOOTSTRAP_RPC_PORT,
} from '../../utilities/steps-utils.mjs';
import FileService from '../../../src/service/file-service.js';

const stepsUtils = new StepsUtils();

Given(
    /^I setup (\d+)[ additional]* node[s]*$/,
    { timeout: 60000 },
    async function nodeSetup(nodeCount) {
        this.logger.log(`I setup ${nodeCount} node${nodeCount !== 1 ? 's' : ''}`);

        const currentNumberOfNodes = Object.keys(this.state.nodes).length;

        await Promise.all(
            Array.from({ length: nodeCount }, (_, i) => {
                const nodeIndex = currentNumberOfNodes + i;
                // wallets[0] is reserved for the bootstrap node; regular nodes start from index 1
                const walletIndex = nodeIndex + 1;
                const blockchains = Object.entries(this.state.localBlockchains).map(
                    ([blockchainId, blockchain]) => {
                        const wallets = blockchain.getWallets();
                        return {
                            blockchainId,
                            operationalWallet: wallets[walletIndex],
                            managementWallet: wallets[walletIndex + Math.floor(wallets.length / 2)],
                            port: blockchain.port,
                        };
                    },
                );

                const rpcPort = 8901 + nodeIndex;
                const networkPort = 9001 + nodeIndex;
                const nodeName = `origintrail-test-${nodeIndex}`;
                const nodeConfiguration = stepsUtils.createNodeConfiguration(
                    blockchains,
                    nodeIndex,
                    nodeName,
                    rpcPort,
                    networkPort,
                    false,
                    this.state.bootstrapPeerMultiaddr,
                );

                // Remove stale data from any interrupted prior run so the node starts clean
                fs.rmSync(path.join(process.cwd(), nodeConfiguration.appDataPath), {
                    recursive: true,
                    force: true,
                });

                const forkedNode = stepsUtils.forkNode(nodeConfiguration);

                // Track immediately so the After hook can kill it even if the step times out
                // before the process sends STARTED.
                this.state.pendingProcesses.push(forkedNode);

                const logFileStream = fs.createWriteStream(
                    `${this.state.scenarioLogDir}/${nodeName}.log`,
                );
                forkedNode.stdout.setEncoding('utf8');
                forkedNode.stdout.on('data', (data) => logFileStream.write(data));
                forkedNode.stderr.setEncoding('utf8');
                forkedNode.stderr.on('data', (data) => logFileStream.write(`[stderr] ${data}`));

                return new Promise((resolve, reject) => {
                    let settled = false;
                    const done = (fn, ...args) => {
                        if (!settled) {
                            settled = true;
                            fn(...args);
                        }
                    };
                    const removePending = () => {
                        const idx = this.state.pendingProcesses.indexOf(forkedNode);
                        if (idx !== -1) this.state.pendingProcesses.splice(idx, 1);
                    };

                    forkedNode.on('error', (err) => {
                        removePending();
                        done(reject, err);
                    });
                    forkedNode.on('exit', (code, signal) => {
                        removePending();
                        done(
                            reject,
                            new Error(
                                `Node ${nodeIndex} process exited with code=${code} signal=${signal} before sending STARTED`,
                            ),
                        );
                    });
                    forkedNode.on('message', (response) => {
                        if (response.error) {
                            // Process reported an error - keep in pendingProcesses for cleanup
                            done(
                                reject,
                                new Error(
                                    `Error initializing node ${nodeIndex}: ${response.error}`,
                                ),
                            );
                            return;
                        }

                        try {
                            const [[firstBlockchainId, firstBlockchain]] = Object.entries(
                                this.state.localBlockchains,
                            );
                            const firstWallets = firstBlockchain.getWallets();

                            const client = new DkgClientHelper({
                                endpoint: 'http://localhost',
                                port: rpcPort,
                                blockchain: {
                                    name: firstBlockchainId,
                                    publicKey: firstWallets[walletIndex].address,
                                    privateKey: firstWallets[walletIndex].privateKey,
                                    rpc: `http://localhost:${firstBlockchain.port}`,
                                    hubContract:
                                        '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                                },
                                maxNumberOfRetries: 20,
                                frequency: 5,
                                contentType: 'all',
                            });

                            const clientBlockchainOptions = {};
                            Object.entries(this.state.localBlockchains).forEach(
                                ([blockchainId, blockchain]) => {
                                    const wallets = blockchain.getWallets();
                                    clientBlockchainOptions[blockchainId] = {
                                        blockchain: {
                                            name: blockchainId,
                                            publicKey: wallets[walletIndex].address,
                                            privateKey: wallets[walletIndex].privateKey,
                                            rpc: `http://localhost:${blockchain.port}`,
                                            hubContract:
                                                '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                                        },
                                    };
                                },
                            );

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

                            // Registration succeeded — safe to remove from pending tracking
                            removePending();
                            done(resolve);
                        } catch (err) {
                            // Registration failed — keep in pendingProcesses so After hook can kill it
                            done(reject, err);
                        }
                    });
                });
            }),
        );
    },
);

Given(
    /^(\d+) bootstrap is running$/,
    { timeout: 60000 },
    async function bootstrapRunning(nodeCount) {
        expect(this.state.bootstraps).to.have.length(0);
        expect(nodeCount).to.be.equal(1); // only one supported currently

        this.logger.log('Initializing bootstrap node');

        const portOffset = Math.floor(Math.random() * 1000);
        const rpcPort = BOOTSTRAP_RPC_PORT + portOffset;
        const networkPort = BOOTSTRAP_NETWORK_PORT + portOffset;

        for (const port of [rpcPort, networkPort]) {
            try {
                execSync(`npx kill-port --port ${port}`, { stdio: 'ignore' });
            } catch {
                // Port may already be free
            }
        }

        this.state.bootstrapPeerMultiaddr = `/ip4/127.0.0.1/tcp/${networkPort}/p2p/QmWyf3dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj`;

        const blockchains = Object.entries(this.state.localBlockchains).map(
            ([blockchainId, blockchain]) => ({
                blockchainId,
                operationalWallet: blockchain.getWallets()[0],
                managementWallet: blockchain.getWallets()[Math.floor(blockchain.getWallets().length / 2)],
                port: blockchain.port,
            }),
        );

        const nodeName = 'origintrail-test-bootstrap';
        const nodeConfiguration = stepsUtils.createNodeConfiguration(
            blockchains,
            0, // bootstrap always uses wallet index 0
            nodeName,
            rpcPort,
            networkPort,
            true, // bootstrap=true: fixed libp2p key, isolated DB/data paths
        );
        this.state.bootstrapRpcPort = rpcPort;

        // Clear any stale data from a previously failed run before starting
        fs.rmSync(path.join(process.cwd(), nodeConfiguration.appDataPath), {
            recursive: true,
            force: true,
        });

        const forkedNode = stepsUtils.forkNode(nodeConfiguration);

        // Track immediately so the After hook can kill it even if the step times out
        // before the process sends STARTED.
        this.state.pendingProcesses.push(forkedNode);

        const logFileStream = fs.createWriteStream(
            `${this.state.scenarioLogDir}/${nodeName}.log`,
        );
        forkedNode.stdout.setEncoding('utf8');
        forkedNode.stdout.on('data', (data) => logFileStream.write(data));
        forkedNode.stderr.setEncoding('utf8');
        forkedNode.stderr.on('data', (data) => logFileStream.write(`[stderr] ${data}`));

        await new Promise((resolve, reject) => {
            let settled = false;
            const done = (fn, ...args) => {
                if (!settled) {
                    settled = true;
                    fn(...args);
                }
            };
            const removePending = () => {
                const idx = this.state.pendingProcesses.indexOf(forkedNode);
                if (idx !== -1) this.state.pendingProcesses.splice(idx, 1);
            };

            forkedNode.on('error', (err) => {
                removePending();
                done(reject, err);
            });
            forkedNode.on('exit', (code, signal) => {
                removePending();
                done(
                    reject,
                    new Error(
                        `Bootstrap process exited with code=${code} signal=${signal} before sending STARTED`,
                    ),
                );
            });
            forkedNode.on('message', (response) => {
                if (response.error) {
                    // Process reported an error — keep in pendingProcesses for cleanup
                    done(
                        reject,
                        new Error(`Error initializing bootstrap node: ${response.error}`),
                    );
                    return;
                }

                try {
                    const [[firstBlockchainId, firstBlockchain]] = Object.entries(
                        this.state.localBlockchains,
                    );

                    const client = new DkgClientHelper({
                        endpoint: 'http://localhost',
                        port: rpcPort,
                        blockchain: {
                            name: firstBlockchainId,
                            publicKey: firstBlockchain.getWallets()[0].address,
                            privateKey: firstBlockchain.getWallets()[0].privateKey,
                            rpc: `http://localhost:${firstBlockchain.port}`,
                            hubContract: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                        },
                        useSSL: false,
                        timeout: 25,
                        loglevel: 'trace',
                    });

                    this.state.bootstraps.push({
                        client,
                        forkedNode,
                        configuration: nodeConfiguration,
                        nodeRpcUrl: `http://localhost:${rpcPort}`,
                        fileService: new FileService({
                            config: nodeConfiguration,
                            logger: this.logger,
                        }),
                    });

                    // Registration succeeded — safe to remove from pending tracking
                    removePending();
                    done(resolve);
                } catch (err) {
                    // Registration failed — keep in pendingProcesses so After hook can kill it
                    done(reject, err);
                }
            });
        });
    },
);

Then(
    /Latest (Get|Publish|Update) operation finished with status: (\S+)$/,
    { timeout: 120000 },
    async function latestOperationFinished(operationName, status) {
        this.logger.log(`Latest ${operationName} operation finished with status: ${status}`);
        const operationData = `latest${operationName}Data`;
        expect(
            !!this.state[operationData],
            `Latest ${operationName} result is undefined. ${operationData} result not started.`,
        ).to.be.equal(true);
        expect(
            !!(this.state[operationData].result || this.state[operationData].status),
            `Latest ${operationName} has no result or status. ${operationData} is not finished.`,
        ).to.be.equal(true);

        expect(
            this.state[operationData].errorType ?? this.state[operationData].status,
            `${operationData} result status validation failed`,
        ).to.be.equal(status);
    },
);

Given(/^I wait for (\d+) seconds$/, { timeout: 100000 }, async function waitFor(seconds) {
    this.logger.log(`I wait for ${seconds} seconds`);
    await sleep(seconds * 1000);
});

/**
 * Deterministic wait for the sharding table to be populated and peers marked active.
 *
 * The publish pipeline needs shard records to exist before it can find replication peers.
 * ShardingTableCheckCommand creates them every ~10 s, but only when the on-chain count
 * differs from the local count. This step polls until all expected records are present,
 * then stamps them with the current time so DialPeersCommand doesn't needlessly re-dial
 * healthy peers whose lastDialed is still the epoch default.
 */
Given(
    /^I wait for nodes to sync and mark active$/,
    { timeout: 30000 },
    async function waitForSyncAndActivate() {
        const expectedPeerCount =
            this.state.bootstraps.length + Object.keys(this.state.nodes).length;

        const allNodes = [...this.state.bootstraps, ...Object.values(this.state.nodes)];
        const dbNames = allNodes.map((n) => n.configuration.operationalDatabase.databaseName);

        const con = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: process.env.REPOSITORY_PASSWORD,
        });

        // Poll until shard records appear in every node's DB
        const maxAttempts = 12;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            let allSynced = true;
            for (const db of dbNames) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const [rows] = await con
                        .promise()
                        .query(`SELECT COUNT(*) AS cnt FROM \`${db}\`.shard`);
                    if (rows[0].cnt < expectedPeerCount) {
                        allSynced = false;
                        break;
                    }
                } catch {
                    allSynced = false;
                    break;
                }
            }
            if (allSynced) {
                this.logger.log(
                    `Sharding table synced after ${attempt * 2}s (${expectedPeerCount} peers)`,
                );
                break;
            }
            if (attempt === maxAttempts) {
                this.logger.log(
                    'Warning: sharding table may not have fully synced within the timeout',
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(2000);
        }

        // Stamp fresh records with current time so that:
        //  1. filterInactive (WHERE last_seen = last_dialed) keeps passing
        //  2. DialPeersCommand doesn't waste cycles re-dialing perfectly healthy peers
        //     whose lastDialed is still the epoch default (Date(0))
        for (const db of dbNames) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await con
                    .promise()
                    .query(`UPDATE \`${db}\`.shard SET last_seen = NOW(), last_dialed = NOW()`);
            } catch (e) {
                this.logger.log(`Warning: could not update shard in ${db}: ${e.message}`);
            }
        }

        con.end();
    },
);

Given(/^Node (\d+) responds to info route$/, { timeout: 30000 }, async function (nodeNumber) {
    const nodeIndex = parseInt(nodeNumber, 10) - 1;
    const MAX_RETRIES = 10;
    let response;
    for (let i = 0; i < MAX_RETRIES; i += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            response = await this.state.nodes[nodeIndex].client.info();
            break;
        } catch {
            // eslint-disable-next-line no-await-in-loop
            await sleep(2000);
        }
    }

    this.logger.log(`Node ${nodeNumber} info response: ${JSON.stringify(response)}`);

    assert.ok(response && response.version, 'Expected node info to contain "version" field');
});
