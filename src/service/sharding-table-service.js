import { BYTES_IN_KILOBYTE, PEER_RECORD_UPDATE_DELAY } from '../constants/constants.js';

class ShardingTableService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.networkModuleManager = ctx.networkModuleManager;
        this.cryptoService = ctx.cryptoService;

        this.memoryCachedPeerIds = {};
    }

    async initialize() {
        await this.networkModuleManager.onPeerConnected((connection) => {
            this.updatePeerRecordLastSeenAndLastDialed(connection.remotePeer.toB58String()).catch(
                (error) => {
                    this.logger.warn(`Unable to update connected peer, error: ${error.message}`);
                },
            );
        });
    }

    async pullBlockchainShardingTable(blockchainId, transaction = null) {
        const options = transaction ? { transaction } : {};

        this.logger.debug(
            `Removing nodes from local sharding table for blockchain ${blockchainId}.`,
        );
        await this.repositoryModuleManager.removeShardingTablePeerRecords(blockchainId, options);

        const shardingTableLength = await this.blockchainModuleManager.getShardingTableLength(
            blockchainId,
        );
        let startingIdentityId = await this.blockchainModuleManager.getShardingTableHead(
            blockchainId,
        );
        const pageSize = 10;
        const shardingTable = [];

        this.logger.debug(
            `Started pulling ${shardingTableLength} nodes from blockchain sharding table.`,
        );

        let sliceIndex = 0;
        while (shardingTable.length < shardingTableLength) {
            // eslint-disable-next-line no-await-in-loop
            const nodes = await this.blockchainModuleManager.getShardingTablePage(
                blockchainId,
                startingIdentityId,
                pageSize,
            );
            shardingTable.push(...nodes.slice(sliceIndex).filter((node) => node.nodeId !== '0x'));
            sliceIndex = 1;
            startingIdentityId = nodes[nodes.length - 1].identityId;
        }

        this.logger.debug(
            `Finished pulling ${shardingTable.length} nodes from blockchain sharding table.`,
        );

        const newPeerRecords = await Promise.all(
            shardingTable.map(async (peer) => {
                const nodeId = this.cryptoService.convertHexToAscii(peer.nodeId);
                const sha256 = await this.cryptoService.sha256(nodeId);

                return {
                    peerId: nodeId,
                    blockchainId,
                    ask: this.cryptoService.convertFromWei(peer.ask, 'ether'),
                    stake: this.cryptoService.convertFromWei(peer.stake, 'ether'),
                    sha256,
                };
            }),
        );

        await this.repositoryModuleManager.createManyPeerRecords(newPeerRecords, options);
    }

    async findShard(blockchainId /* filterInactive = false */) {
        let peers = await this.repositoryModuleManager.getAllPeerRecords(blockchainId);
        peers = peers.map((peer, index) => ({ ...peer.dataValues, index }));
        return peers;
    }

    async isNodePartOfShard(blockchainId, peerId) {
        return this.repositoryModuleManager.isNodePartOfShard(blockchainId, peerId);
    }

    // TODO: Remove this
    calculateBidSuggestion(askOffset, sorted, blockchainId, kbSize, epochsNumber, r0) {
        const effectiveAskOffset = Math.min(askOffset, sorted.length - 1);
        const { ask } = sorted[effectiveAskOffset];

        const bidSuggestion = this.cryptoService
            .convertToWei(ask)
            .mul(kbSize)
            .mul(epochsNumber)
            .mul(r0)
            .div(BYTES_IN_KILOBYTE);
        return bidSuggestion.toString();
    }

    async findEligibleNodes(neighbourhood, bid, r1, r0) {
        return neighbourhood.filter((node) => node.ask <= bid / r0).slice(0, r1);
    }

    async dial(peerId) {
        try {
            const { addresses } = await this.findPeerAddressAndProtocols(peerId);
            if (addresses.length) {
                if (peerId !== this.networkModuleManager.getPeerId().toB58String()) {
                    this.logger.trace(`Dialing peer ${peerId}.`);
                    await this.networkModuleManager.dial(peerId);
                }
                await this.updatePeerRecordLastSeenAndLastDialed(peerId);
            } else {
                await this.updatePeerRecordLastDialed(peerId);
            }
        } catch (error) {
            this.logger.trace(`Unable to dial peer ${peerId}. Error: ${error.message}`);
            await this.updatePeerRecordLastDialed(peerId);
        }
    }

    async updatePeerRecordLastSeenAndLastDialed(peerId) {
        const now = Date.now();
        const timestampThreshold = now - PEER_RECORD_UPDATE_DELAY;

        if (!this.memoryCachedPeerIds[peerId]) {
            this.memoryCachedPeerIds[peerId] = {
                lastDialed: 0,
                lastSeen: 0,
            };
        }
        if (
            this.memoryCachedPeerIds[peerId].lastSeen < timestampThreshold ||
            this.memoryCachedPeerIds[peerId].lastDialed < timestampThreshold
        ) {
            const [rowsUpdated] =
                await this.repositoryModuleManager.updatePeerRecordLastSeenAndLastDialed(
                    peerId,
                    now,
                );
            if (rowsUpdated) {
                this.memoryCachedPeerIds[peerId].lastDialed = now;
                this.memoryCachedPeerIds[peerId].lastSeen = now;
            }
        }
    }

    async updatePeerRecordLastDialed(peerId) {
        const now = Date.now();
        const timestampThreshold = now - PEER_RECORD_UPDATE_DELAY;
        if (!this.memoryCachedPeerIds[peerId]) {
            this.memoryCachedPeerIds[peerId] = {
                lastDialed: 0,
                lastSeen: 0,
            };
        }
        if (this.memoryCachedPeerIds[peerId].lastDialed < timestampThreshold) {
            const [rowsUpdated] = await this.repositoryModuleManager.updatePeerRecordLastDialed(
                peerId,
                now,
            );
            if (rowsUpdated) {
                this.memoryCachedPeerIds[peerId].lastDialed = now;
            }
        }
    }

    async findPeerAddressAndProtocols(peerId) {
        this.logger.trace(`Searching for peer ${peerId} multiaddresses in peer store.`);
        let peerInfo = await this.networkModuleManager.getPeerInfo(peerId);
        if (
            !peerInfo?.addresses?.length &&
            peerId !== this.networkModuleManager.getPeerId().toB58String()
        ) {
            try {
                this.logger.trace(`Searching for peer ${peerId} multiaddresses on the network.`);
                await this.networkModuleManager.findPeer(peerId);
                peerInfo = await this.networkModuleManager.getPeerInfo(peerId);
            } catch (error) {
                this.logger.trace(`Unable to find peer ${peerId}. Error: ${error.message}`);
            }
        }

        return {
            id: peerId,
            addresses: peerInfo?.addresses ?? [],
            protocols: peerInfo?.protocols ?? [],
        };
    }
}

export default ShardingTableService;
