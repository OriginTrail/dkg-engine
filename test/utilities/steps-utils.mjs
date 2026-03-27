import { fork } from 'child_process';

const otNodeProcessPath = './test/bdd/steps/lib/ot-node-process.mjs';

/**
 * Fixed libp2p private key for the bootstrap node.
 * Produces a deterministic PeerID (QmWyf3dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj) that matches
 * the bootstrap peer address baked into the default network config so regular nodes can find it.
 */
const BOOTSTRAP_LIBP2P_PRIVATE_KEY =
    'CAAS4QQwggJdAgEAAoGBALOYSCZsmINMpFdH8ydA9CL46fB08F3ELfb9qiIq+z4RhsFwi7lByysRnYT/NLm8jZ4RvlsSqOn2ZORJwBywYD5MCvU1TbEWGKxl5LriW85ZGepUwiTZJgZdDmoLIawkpSdmUOc1Fbnflhmj/XzAxlnl30yaa/YvKgnWtZI1/IwfAgMBAAECgYEAiZq2PWqbeI6ypIVmUr87z8f0Rt7yhIWZylMVllRkaGw5WeGHzQwSRQ+cJ5j6pw1HXMOvnEwxzAGT0C6J2fFx60C6R90TPos9W0zSU+XXLHA7AtazjlSnp6vHD+RxcoUhm1RUPeKU6OuUNcQVJu1ZOx6cAcP/I8cqL38JUOOS7XECQQDex9WUKtDnpHEHU/fl7SvCt0y2FbGgGdhq6k8nrWtBladP5SoRUFuQhCY8a20fszyiAIfxQrtpQw1iFPBpzoq1AkEAzl/s3XPGi5vFSNGLsLqbVKbvoW9RUaGN8o4rU9oZmPFL31Jo9FLA744YRer6dYE7jJMel7h9VVWsqa9oLGS8AwJALYwfv45Nbb6yGTRyr4Cg/MtrFKM00K3YEGvdSRhsoFkPfwc0ZZvPTKmoA5xXEC8eC2UeZhYlqOy7lL0BNjCzLQJBAMpvcgtwa8u6SvU5B0ueYIvTDLBQX3YxgOny5zFjeUR7PS+cyPMQ0cyql8jNzEzDLcSg85tkDx1L4wi31Pnm/j0CQFH/6MYn3r9benPm2bYSe9aoJp7y6ht2DmXmoveNbjlEbb8f7jAvYoTklJxmJCcrdbNx/iCj2BuAinPPgEmUzfQ=';

// Port 9000 is PHP-FPM's default port and is commonly occupied on developer machines.
// Use high-numbered ports that are unlikely to conflict with system services or retries.
const BOOTSTRAP_NETWORK_PORT = 19000;
const BOOTSTRAP_RPC_PORT = 18900;

/**
 * Loopback multiaddr for the bootstrap node. Regular nodes dial this on startup for DHT seeding.
 * PeerID corresponds to BOOTSTRAP_LIBP2P_PRIVATE_KEY. Uses 127.0.0.1 — the default config uses
 * 0.0.0.0 which is not a valid dial address and was causing silent connection failures.
 */
const BOOTSTRAP_PEER_MULTIADDR = `/ip4/127.0.0.1/tcp/${BOOTSTRAP_NETWORK_PORT}/p2p/QmWyf3dtqJnhuCpzEDTNmNFYc5tjxTrXhGcUUmGHdg2gtj`;

class StepsUtils {
    forkNode(nodeConfiguration) {
        const forkedNode = fork(otNodeProcessPath, [], { silent: true });
        forkedNode.send(JSON.stringify(nodeConfiguration));
        return forkedNode;
    }

    /**
     * Builds a full node configuration object for BDD test scenarios.
     *
     * @param {Array<{blockchainId: string, port: number, operationalWallet: object, managementWallet: object}>} blockchains
     * @param {number} nodeIndex   - Zero-based index; drives unique DB names, ports, and triple-store repos
     * @param {string} nodeName
     * @param {number} rpcPort     - HTTP API port
     * @param {number} networkPort - libp2p P2P port
     * @param {boolean} [bootstrap=false] - When true, uses the fixed libp2p key (known PeerID),
     *                                      empty bootstrap list, and isolated DB/data paths
     * @param {string} [bootstrapPeerMultiaddr] - For regular nodes, the bootstrap peer multiaddr to dial.
     *                                            If omitted, BOOTSTRAP_PEER_MULTIADDR is used.
     * @returns {object} Node configuration
     */
    createNodeConfiguration(
        blockchains,
        nodeIndex,
        nodeName,
        rpcPort,
        networkPort,
        bootstrap = false,
        bootstrapPeerMultiaddr = BOOTSTRAP_PEER_MULTIADDR,
    ) {
        let config = {
            modules: {
                blockchain: {
                    implementation: {},
                },
                network: {
                    implementation: {
                        'libp2p-service': {
                            config: {
                                port: networkPort,
                                privateKey: bootstrap ? BOOTSTRAP_LIBP2P_PRIVATE_KEY : undefined,
                                bootstrap: bootstrap ? [] : [bootstrapPeerMultiaddr],
                                peerRouting: {
                                    refreshManager: {
                                        enabled: false,
                                    },
                                },
                            },
                        },
                    },
                },
                repository: {
                    implementation: {
                        'sequelize-repository': {
                            config: {
                                database: bootstrap
                                    ? 'operationaldbbootstrap'
                                    : `operationaldbnode${nodeIndex}`,
                            },
                        },
                    },
                },
                tripleStore: {
                    implementation: {
                        'ot-blazegraph': {
                            config: {
                                repositories: {
                                    dkg: {
                                        url: 'http://localhost:9999',
                                        name: bootstrap ? 'dkg-bootstrap' : `dkg-${nodeIndex}`,
                                        username: 'admin',
                                        password: '',
                                    },
                                    privateCurrent: {
                                        url: 'http://localhost:9999',
                                        name: bootstrap
                                            ? 'private-current-bootstrap'
                                            : `private-current-${nodeIndex}`,
                                        username: 'admin',
                                        password: '',
                                    },
                                    publicCurrent: {
                                        url: 'http://localhost:9999',
                                        name: bootstrap
                                            ? 'public-current-bootstrap'
                                            : `public-current-${nodeIndex}`,
                                        username: 'admin',
                                        password: '',
                                    },
                                },
                            },
                        },
                    },
                },
                validation: {
                    enabled: true,
                    implementation: {
                        'merkle-validation': {
                            enabled: true,
                            package: './validation/implementation/merkle-validation.js',
                        },
                    },
                },
                httpClient: {
                    implementation: {
                        'express-http-client': {
                            config: {
                                port: rpcPort,
                            },
                        },
                    },
                },
            },
            auth: {
                ipBasedAuthEnabled: false,
            },
            operationalDatabase: {
                databaseName: bootstrap
                    ? 'operationaldbbootstrap'
                    : `operationaldbnode${nodeIndex}`,
            },
            rpcPort,
            appDataPath: bootstrap ? 'test-data-bootstrap' : `test-data${nodeIndex}`,
            graphDatabase: {
                name: nodeName,
            },
        };

        for (const blockchain of blockchains) {
            config.modules.blockchain.implementation[blockchain.blockchainId] = {
                enabled: true,
                package: './blockchain/implementation/hardhat/hardhat-service.js',
                config: {
                    hubContractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                    rpcEndpoints: [`http://localhost:${blockchain.port}`],
                    initialStakeAmount: 50000,
                    initialAskAmount: 0.2,
                    operationalWallets: [{
                        privateKey: blockchain.operationalWallet.privateKey,
                        evmAddress: blockchain.operationalWallet.address,
                    }],
                    evmManagementWalletPublicKey: blockchain.managementWallet.address,
                    evmManagementWalletPrivateKey: blockchain.managementWallet.privateKey,
                    nodeName: bootstrap ? 'bootstrap' : `node${nodeIndex}`,
                },
            };
        }
        return config;
    }
}
export { BOOTSTRAP_NETWORK_PORT, BOOTSTRAP_RPC_PORT, BOOTSTRAP_PEER_MULTIADDR };
export default StepsUtils;
