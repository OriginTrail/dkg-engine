import {
    BYTES_IN_KILOBYTE,
    CONTRACTS,
    DEFAULT_BLOCKCHAIN_EVENT_SYNC_PERIOD_IN_MILLS,
    PEER_RECORD_UPDATE_DELAY,
    LOW_BID_SUGGESTION,
    MED_BID_SUGGESTION,
    HIGH_BID_SUGGESTION,
    ALL_BID_SUGGESTION,
    LOW_BID_SUGGESTION_OFFSET,
    MED_BID_SUGGESTION_OFFSET,
    HIGH_BID_SUGGESTION_OFFSET,
    ERROR_TYPE,
    BID_SUGGESTION_RANGE_ENUM,
} from '../constants/constants.js';

class ShardingTableService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.networkModuleManager = ctx.networkModuleManager;
        this.hashingService = ctx.hashingService;
        this.proximityScoringService = ctx.proximityScoringService;

        this.memoryCachedPeerIds = {};
    }

    async initialize() {
        const pullBlockchainShardingTables = this.blockchainModuleManager
            .getImplementationNames()
            .map(async (blockchainId) => {
                await this.pullBlockchainShardingTable(blockchainId);
                const peers = await this.repositoryModuleManager.getAllPeerRecords(blockchainId);
                await Promise.all(
                    peers.map((pr) =>
                        this.networkModuleManager.addRoutingTablePeer(pr.peerId, blockchainId),
                    ),
                );
            });
        await Promise.all(pullBlockchainShardingTables);

        await this.networkModuleManager.onPeerConnected((connection) => {
            const peerIdString = connection.remotePeer.toB58String();
            if (!this.networkModuleManager.hasRoutingTablePeer(peerIdString)) return;

            this.logger.trace(
                `Node connected to ${peerIdString}, updating sharding table last seen and last dialed.`,
            );
            this.updatePeerRecordLastSeenAndLastDialed(peerIdString).catch((error) => {
                this.logger.warn(`Unable to update connected peer, error: ${error.message}`);
            });
        });
    }

    async pullBlockchainShardingTable(blockchainId, force = false) {
        const lastCheckedBlock = await this.repositoryModuleManager.getLastCheckedBlock(
            blockchainId,
            CONTRACTS.SHARDING_TABLE_CONTRACT,
        );

        if (
            force ||
            (lastCheckedBlock?.lastCheckedTimestamp &&
                Date.now() - lastCheckedBlock.lastCheckedTimestamp <
                    DEFAULT_BLOCKCHAIN_EVENT_SYNC_PERIOD_IN_MILLS)
        ) {
            return;
        }

        this.logger.debug(
            `Removing nodes from local sharding table for blockchain ${blockchainId}.`,
        );
        await this.repositoryModuleManager.removeShardingTablePeerRecords(blockchainId);

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

        await this.repositoryModuleManager.createManyPeerRecords(
            await Promise.all(
                shardingTable.map(async (peer) => {
                    const nodeId = this.blockchainModuleManager.convertHexToAscii(
                        blockchainId,
                        peer.nodeId,
                    );
                    const sha256 = await this.hashingService.callHashFunction(1, nodeId);

                    return {
                        peerId: nodeId,
                        blockchainId,
                        ask: this.blockchainModuleManager.convertFromWei(
                            blockchainId,
                            peer.ask,
                            'ether',
                        ),
                        stake: this.blockchainModuleManager.convertFromWei(
                            blockchainId,
                            peer.stake,
                            'ether',
                        ),
                        sha256,
                    };
                }),
            ),
        );
    }

    async findNeighbourhood(blockchainId, key, r2, hashFunctionId, proximityScoreFunctionsPairId) {
        let peers = await this.repositoryModuleManager.getAllPeerRecords(blockchainId);
        peers = peers.map((peer, index) => ({ ...peer.dataValues, index }));
        const keyHash = await this.hashingService.callHashFunction(hashFunctionId, key);

        const sortedPeers = this.sortPeers(
            blockchainId,
            keyHash,
            peers,
            r2,
            hashFunctionId,
            proximityScoreFunctionsPairId,
        );
        return sortedPeers;
    }

    async sortPeers(
        blockchainId,
        keyHash,
        peers,
        count,
        hashFunctionId,
        proximityScoreFunctionsPairId,
    ) {
        const hashFunctionName = this.hashingService.getHashFunctionName(hashFunctionId);
        const peersWithDistance = await Promise.all(
            peers.map(async (peer) => ({
                ...peer,
                distance: await this.proximityScoringService.callProximityFunction(
                    blockchainId,
                    proximityScoreFunctionsPairId,
                    peer[hashFunctionName],
                    keyHash,
                ),
            })),
        );
        peersWithDistance.sort((a, b) => {
            if (a.distance.lt(b.distance)) {
                return -1;
            }
            if (a.distance.gt(b.distance)) {
                return 1;
            }
            return 0;
        });
        return peersWithDistance.slice(0, count);
    }

    async getBidSuggestion(
        blockchainId,
        epochsNumber,
        assertionSize,
        contentAssetStorageAddress,
        firstAssertionId,
        hashFunctionId,
        proximityScoreFunctionsPairId,
        bidSuggestionRange = LOW_BID_SUGGESTION,
    ) {
        const kbSize = assertionSize < BYTES_IN_KILOBYTE ? BYTES_IN_KILOBYTE : assertionSize;
        const peerRecords = await this.findNeighbourhood(
            blockchainId,
            this.blockchainModuleManager.encodePacked(
                blockchainId,
                ['address', 'bytes32'],
                [contentAssetStorageAddress, firstAssertionId],
            ),
            await this.blockchainModuleManager.getR2(blockchainId),
            hashFunctionId,
            proximityScoreFunctionsPairId,
        );
        const r0 = await this.blockchainModuleManager.getR0(blockchainId);
        // todo remove this line once we implement logic for storing assertion in publish node if it's in neighbourhood
        const myPeerId = this.networkModuleManager.getPeerId().toB58String();
        const filteredPeerRecords = peerRecords.filter((peer) => peer.peerId !== myPeerId);
        const sorted = filteredPeerRecords.sort((a, b) => a.ask - b.ask);

        if (bidSuggestionRange === ALL_BID_SUGGESTION) {
            const allBidSuggestions = {};
            allBidSuggestions[LOW_BID_SUGGESTION] = this.calculateBidSuggestion(
                LOW_BID_SUGGESTION_OFFSET,
                sorted,
                blockchainId,
                kbSize,
                epochsNumber,
                r0,
            );
            allBidSuggestions[MED_BID_SUGGESTION] = this.calculateBidSuggestion(
                MED_BID_SUGGESTION_OFFSET,
                sorted,
                blockchainId,
                kbSize,
                epochsNumber,
                r0,
            );
            allBidSuggestions[HIGH_BID_SUGGESTION] = this.calculateBidSuggestion(
                HIGH_BID_SUGGESTION_OFFSET,
                sorted,
                blockchainId,
                kbSize,
                epochsNumber,
                r0,
            );

            return allBidSuggestions;
        }
        let askOffset;
        switch (bidSuggestionRange) {
            case LOW_BID_SUGGESTION:
                askOffset = LOW_BID_SUGGESTION_OFFSET;
                break;
            case MED_BID_SUGGESTION:
                askOffset = MED_BID_SUGGESTION_OFFSET;
                break;
            case HIGH_BID_SUGGESTION:
                askOffset = HIGH_BID_SUGGESTION_OFFSET;
                break;
            default:
                this.logger.error(
                    `${ERROR_TYPE.UNSUPPORTED_BID_SUGGESTION_RANGE_ERROR}: Supported values: ${BID_SUGGESTION_RANGE_ENUM}.`,
                );
                throw Error(ERROR_TYPE.UNSUPPORTED_BID_SUGGESTION_RANGE_ERROR);
        }
        const bidSuggestion = this.calculateBidSuggestion(
            askOffset,
            sorted,
            blockchainId,
            kbSize,
            epochsNumber,
            r0,
        );
        return bidSuggestion;
    }

    calculateBidSuggestion(askOffset, sorted, blockchainId, kbSize, epochsNumber, r0) {
        const effectiveAskOffset = Math.min(askOffset, sorted.length - 1);
        const { ask } = sorted[effectiveAskOffset];

        const bidSuggestion = this.blockchainModuleManager
            .convertToWei(blockchainId, ask)
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
        const { addresses } = await this.findPeerAddressAndProtocols(peerId);
        if (addresses.length) {
            try {
                if (peerId !== this.networkModuleManager.getPeerId().toB58String()) {
                    this.logger.trace(`Dialing peer ${peerId}.`);
                    await this.networkModuleManager.dial(peerId);
                }
                await this.updatePeerRecordLastSeenAndLastDialed(peerId);
            } catch (error) {
                this.logger.trace(`Unable to dial peer ${peerId}. Error: ${error.message}`);
                await this.updatePeerRecordLastDialed(peerId);
            }
        } else {
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

    async getNeighboorhoodEdgeNodes(
        neighbourhood,
        blockchainId,
        hashFunctionId,
        proximityScoreFunctionsPairId,
        key,
    ) {
        const keyHash = await this.hashingService.callHashFunction(hashFunctionId, key);

        const hashFunctionName = this.hashingService.getHashFunctionName(hashFunctionId);
        const assetPositionOnHashRing = await this.blockchainModuleManager.toBigNumber(
            blockchainId,
            keyHash,
        );
        const hashRing = [];

        const maxDistance = await this.proximityScoringService.callProximityFunction(
            blockchainId,
            proximityScoreFunctionsPairId,
            neighbourhood[neighbourhood.length - 1][hashFunctionName],
            keyHash,
        );

        for (const neighbour of neighbourhood) {
            // eslint-disable-next-line no-await-in-loop
            const neighbourPositionOnHashRing = await this.blockchainModuleManager.toBigNumber(
                blockchainId,
                neighbour[hashFunctionName],
            );
            if (assetPositionOnHashRing.lte(neighbourPositionOnHashRing)) {
                if (neighbourPositionOnHashRing.sub(assetPositionOnHashRing).lte(maxDistance)) {
                    hashRing.push(neighbour);
                } else {
                    hashRing.unshift(neighbour);
                }
            } else if (assetPositionOnHashRing.gt(neighbourPositionOnHashRing)) {
                if (assetPositionOnHashRing.sub(neighbourPositionOnHashRing).lte(maxDistance)) {
                    hashRing.unshift(neighbour);
                } else {
                    hashRing.push(neighbour);
                }
            }
        }

        return {
            leftEdge: hashRing[0],
            rightEdge: hashRing[hashRing.length - 1],
        };
    }
}

export default ShardingTableService;
