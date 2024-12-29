import { setTimeout } from 'timers/promises';
import {
    CONTENT_ASSET_HASH_FUNCTION_ID,
    CONTRACTS,
    CONTRACT_EVENT_FETCH_INTERVALS,
    TRIPLE_STORE_REPOSITORIES,
    NODE_ENVIRONMENTS,
    PENDING_STORAGE_REPOSITORIES,
    CONTRACT_EVENTS,
    MAXIMUM_FETCH_EVENTS_FAILED_COUNT,
    DELAY_BETWEEN_FAILED_FETCH_EVENTS_MILLIS,
    CONTRACT_EVENT_TO_GROUP_MAPPING,
    GROUPED_CONTRACT_EVENTS,
    ZERO_BYTES32,
} from '../constants/constants.js';

const fetchEventsFailedCount = {};

const eventNames = Object.values(CONTRACT_EVENTS).flatMap((e) => e);

class BlockchainEventListenerService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.networkModuleManager = ctx.networkModuleManager;
        this.tripleStoreService = ctx.tripleStoreService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.ualService = ctx.ualService;
        this.hashingService = ctx.hashingService;
        this.serviceAgreementService = ctx.serviceAgreementService;
        this.shardingTableService = ctx.shardingTableService;
        this.paranetService = ctx.paranetService;

        this.eventGroupsBuffer = {};
    }

    async initialize() {
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(
                `Initializing blockchain event listener for blockchain ${blockchainId}, handling missed events`,
            );
            this.eventGroupsBuffer[blockchainId] = {};
            promises.push(this.fetchAndHandleBlockchainEvents(blockchainId));
        }
        await Promise.all(promises);
    }

    startListeningOnEvents() {
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.listenOnBlockchainEvents(blockchainId);
            this.logger.info(`Event listener initialized for blockchain: '${blockchainId}'.`);
        }
    }

    async fetchAndHandleBlockchainEvents(blockchainId) {
        const devEnvironment =
            process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT ||
            process.env.NODE_ENV === NODE_ENVIRONMENTS.TEST;

        const currentBlock = await this.blockchainModuleManager.getBlockNumber(blockchainId);

        if (devEnvironment) {
            // handling sharding table node added events first for tests and local network setup
            // because of race condition for node added and ask updated events
            const shardingTableEvents = await this.getContractEvents(
                blockchainId,
                CONTRACTS.SHARDING_TABLE_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.SHARDING_TABLE,
            );

            await this.handleBlockchainEvents(shardingTableEvents, blockchainId);
        }

        const syncContractEventsPromises = [
            this.getContractEvents(
                blockchainId,
                CONTRACTS.SHARDING_TABLE_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.SHARDING_TABLE,
            ),
            this.getContractEvents(
                blockchainId,
                CONTRACTS.STAKING_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.STAKING,
            ),
            this.getContractEvents(
                blockchainId,
                CONTRACTS.PROFILE_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.PROFILE,
            ),
            this.getContractEvents(
                blockchainId,
                CONTRACTS.COMMIT_MANAGER_V1_U1_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.COMMIT_MANAGER_V1,
            ),
            this.getContractEvents(
                blockchainId,
                CONTRACTS.SERVICE_AGREEMENT_V1_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.SERVICE_AGREEMENT_V1,
            ),
            this.getContractEvents(
                blockchainId,
                CONTRACTS.PARAMETERS_STORAGE_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.PARAMETERS_STORAGE,
            ),
            this.getContractEvents(
                blockchainId,
                CONTRACTS.LOG2PLDSF_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.LOG2PLDSF,
            ),
            this.getContractEvents(
                blockchainId,
                CONTRACTS.LINEAR_SUM_CONTRACT,
                currentBlock,
                CONTRACT_EVENTS.LINEAR_SUM,
            ),
        ];

        if (!devEnvironment) {
            syncContractEventsPromises.push(
                this.getContractEvents(
                    blockchainId,
                    CONTRACTS.HUB_CONTRACT,
                    currentBlock,
                    CONTRACT_EVENTS.HUB,
                ),
            );
        }
        const contractEvents = await Promise.all(syncContractEventsPromises);

        await this.handleBlockchainEvents(
            contractEvents.flatMap((events) => events),
            blockchainId,
        );
    }

    listenOnBlockchainEvents(blockchainId) {
        const devEnvironment =
            process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT ||
            process.env.NODE_ENV === NODE_ENVIRONMENTS.TEST;

        const eventFetchInterval = devEnvironment
            ? CONTRACT_EVENT_FETCH_INTERVALS.DEVELOPMENT
            : CONTRACT_EVENT_FETCH_INTERVALS.MAINNET;

        let working = false;
        fetchEventsFailedCount[blockchainId] = 0;
        const fetchEventInterval = setInterval(async () => {
            if (working) return;
            try {
                working = true;
                await this.fetchAndHandleBlockchainEvents(blockchainId);
                fetchEventsFailedCount[blockchainId] = 0;
            } catch (e) {
                if (fetchEventsFailedCount[blockchainId] >= MAXIMUM_FETCH_EVENTS_FAILED_COUNT) {
                    clearInterval(fetchEventInterval);
                    this.blockchainModuleManager.removeImplementation(blockchainId);
                    if (!this.blockchainModuleManager.getImplementationNames().length) {
                        this.logger.error(
                            `Unable to fetch new events for blockchain: ${blockchainId}. Error message: ${e.message} OT-node shutting down...`,
                        );
                        process.exit(1);
                    }
                    this.logger.error(
                        `Unable to fetch new events for blockchain: ${blockchainId}. Error message: ${e.message} blockchain implementation removed.`,
                    );
                }
                this.logger.error(
                    `Failed to get and process blockchain events for blockchain: ${blockchainId}. Error: ${e}`,
                );
                fetchEventsFailedCount[blockchainId] += 1;
                await setTimeout(DELAY_BETWEEN_FAILED_FETCH_EVENTS_MILLIS);
            } finally {
                working = false;
            }
        }, eventFetchInterval);
    }

    async getContractEvents(blockchainId, contractName, currentBlock, eventsToFilter) {
        const lastCheckedBlockObject = await this.repositoryModuleManager.getLastCheckedBlock(
            blockchainId,
            contractName,
        );

        const result = await this.blockchainModuleManager.getAllPastEvents(
            blockchainId,
            contractName,
            eventsToFilter,
            lastCheckedBlockObject?.lastCheckedBlock ?? 0,
            lastCheckedBlockObject?.lastCheckedTimestamp ?? 0,
            currentBlock,
        );

        await this.repositoryModuleManager.updateLastCheckedBlock(
            blockchainId,
            result.lastCheckedBlock,
            Date.now(0),
            contractName,
        );

        if (!result.eventsMissed) {
            await this.shardingTableService.pullBlockchainShardingTable(blockchainId, true);
        }

        return result.events;
    }

    async handleBlockchainEvents(events, blockchainId) {
        const eventsForProcessing = events.filter((event) => eventNames.includes(event.event));

        if (eventsForProcessing?.length) {
            this.logger.trace(
                `${eventsForProcessing.length} blockchain events caught on blockchain ${blockchainId}.`,
            );
            await this.repositoryModuleManager.insertBlockchainEvents(eventsForProcessing);
        }
        const unprocessedEvents =
            await this.repositoryModuleManager.getAllUnprocessedBlockchainEvents(
                eventNames,
                blockchainId,
            );

        if (unprocessedEvents?.length) {
            this.logger.trace(
                `Processing ${unprocessedEvents.length} blockchain events on blockchain ${blockchainId}.`,
            );
            let batchedEvents = {};
            let currentBlockNumber = 0;
            for (const event of unprocessedEvents) {
                if (event.block !== currentBlockNumber) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.handleBlockBatchedEvents(batchedEvents);
                    batchedEvents = {};
                    currentBlockNumber = event.block;
                }

                // Check if event should be grouped with other event
                const eventsGroupName = CONTRACT_EVENT_TO_GROUP_MAPPING[event.event];
                if (eventsGroupName) {
                    // Get Events Group object containing predefined events and Grouping Key (Event Argument)
                    const eventsGroup = GROUPED_CONTRACT_EVENTS[eventsGroupName];
                    // Get value of the Grouping Key from the Event
                    const groupingKeyValue = JSON.parse(event.data)[eventsGroup.groupingKey];

                    if (!this.eventGroupsBuffer[blockchainId][eventsGroupName]) {
                        this.eventGroupsBuffer[blockchainId][eventsGroupName] = {};
                    }

                    if (!this.eventGroupsBuffer[blockchainId][eventsGroupName][groupingKeyValue]) {
                        this.eventGroupsBuffer[blockchainId][eventsGroupName][groupingKeyValue] =
                            [];
                    }

                    // Push event to the buffer until Events Group is not full
                    this.eventGroupsBuffer[blockchainId][eventsGroupName][groupingKeyValue].push(
                        event,
                    );

                    // Mark event as processed
                    // TODO: There should be a smarter way to do this, because it will cause troubles
                    // in case node goes offline while only catched some of the events from the group
                    // and not all of them. Buffer will be cleared and event is already marked as processed.
                    // eslint-disable-next-line no-await-in-loop
                    await this.repositoryModuleManager.markBlockchainEventsAsProcessed([event]);

                    // When all expected Events from the Event Group are collected
                    if (
                        this.eventGroupsBuffer[blockchainId][eventsGroupName][groupingKeyValue]
                            .length === eventsGroup.events.length
                    ) {
                        if (!batchedEvents[eventsGroupName]) {
                            batchedEvents[eventsGroupName] = [];
                        }

                        // Add Events Group to the Processing Queue
                        batchedEvents[eventsGroupName].push(
                            this.eventGroupsBuffer[blockchainId][eventsGroupName][groupingKeyValue],
                        );

                        // Remove Events Group from the Buffer
                        delete this.eventGroupsBuffer[blockchainId][eventsGroupName][
                            groupingKeyValue
                        ];
                    }
                } else if (batchedEvents[event.event]) {
                    batchedEvents[event.event].push(event);
                } else {
                    batchedEvents[event.event] = [event];
                }
            }

            await this.handleBlockBatchedEvents(batchedEvents);
        }
    }

    async handleBlockBatchedEvents(batchedEvents) {
        const handleBlockEventsPromises = [];
        for (const [eventName, blockEvents] of Object.entries(batchedEvents)) {
            handleBlockEventsPromises.push(this.handleBlockEvents(eventName, blockEvents));
        }
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(handleBlockEventsPromises);
    }

    async handleBlockEvents(eventName, blockEvents) {
        const handlerFunctionName = `handle${eventName}Events`;
        if (!this[handlerFunctionName]) return;
        this.logger.trace(`${blockEvents.length} ${eventName} events caught.`);
        try {
            await this[handlerFunctionName](blockEvents);
            await this.repositoryModuleManager.markBlockchainEventsAsProcessed(blockEvents);
        } catch (error) {
            this.logger.warn(
                `Error while processing events: ${eventName}. Error: ${error.message}`,
            );
        }
    }

    async handleParameterChangedEvents(blockEvents) {
        for (const event of blockEvents) {
            const { blockchainId, contract, data } = event;
            const { parameterName, parameterValue } = JSON.parse(data);
            switch (contract) {
                case CONTRACTS.LOG2PLDSF_CONTRACT:
                    // This invalidates contracts parameter
                    // TODO: Create function for contract call cache invalidation
                    this.blockchainModuleManager.setContractCallCache(
                        blockchainId,
                        CONTRACTS.LOG2PLDSF_CONTRACT,
                        parameterName,
                        null,
                    );
                    break;
                case CONTRACTS.LINEAR_SUM_CONTRACT:
                    this.blockchainModuleManager.setContractCallCache(
                        blockchainId,
                        CONTRACTS.LINEAR_SUM_CONTRACT,
                        parameterName,
                        null,
                    );
                    break;
                case CONTRACTS.PARAMETERS_STORAGE_CONTRACT:
                    this.blockchainModuleManager.setContractCallCache(
                        blockchainId,
                        CONTRACTS.PARAMETERS_STORAGE_CONTRACT,
                        parameterName,
                        parameterValue,
                    );
                    break;
                default:
                    this.logger.warn(
                        `Unable to handle parameter changed event. Unknown contract name ${event.contract}`,
                    );
            }
        }
    }

    handleNewContractEvents(blockEvents) {
        for (const event of blockEvents) {
            const { contractName, newContractAddress } = JSON.parse(event.data);
            this.blockchainModuleManager.initializeContract(
                event.blockchainId,
                contractName,
                newContractAddress,
            );
        }
    }

    async handleContractChangedEvents(blockEvents) {
        await Promise.all(
            blockEvents.map(async (event) => {
                const { contractName, newContractAddress } = JSON.parse(event.data);
                this.blockchainModuleManager.initializeContract(
                    event.blockchainId,
                    contractName,
                    newContractAddress,
                );

                if (contractName === CONTRACTS.SHARDING_TABLE_CONTRACT) {
                    await this.shardingTableService.pullBlockchainShardingTable(
                        event.blockchainId,
                        true,
                    );
                }
            }),
        );
    }

    handleNewAssetStorageEvents(blockEvents) {
        for (const event of blockEvents) {
            const { newContractAddress } = JSON.parse(event.data);
            this.blockchainModuleManager.initializeAssetStorageContract(
                event.blockchainId,
                newContractAddress,
            );
        }
    }

    handleAssetStorageChangedEvents(blockEvents) {
        for (const event of blockEvents) {
            const { newContractAddress } = JSON.parse(event.data);
            this.blockchainModuleManager.initializeAssetStorageContract(
                event.blockchainId,
                newContractAddress,
            );
        }
    }

    async handleNodeAddedEvents(blockEvents) {
        const peerRecords = await Promise.all(
            blockEvents.map(async (event) => {
                const eventData = JSON.parse(event.data);

                const nodeId = this.blockchainModuleManager.convertHexToAscii(
                    event.blockchainId,
                    eventData.nodeId,
                );

                const sha256 = await this.hashingService.callHashFunction(
                    CONTENT_ASSET_HASH_FUNCTION_ID,
                    nodeId,
                );

                this.logger.trace(`Adding peer id: ${nodeId} to sharding table.`);
                return {
                    peerId: nodeId,
                    blockchainId: event.blockchainId,
                    ask: this.blockchainModuleManager.convertFromWei(
                        event.blockchainId,
                        eventData.ask,
                    ),
                    stake: this.blockchainModuleManager.convertFromWei(
                        event.blockchainId,
                        eventData.stake,
                    ),
                    lastSeen: new Date(0),
                    sha256,
                };
            }),
        );

        await this.repositoryModuleManager.createManyPeerRecords(peerRecords);
        await Promise.all(
            peerRecords.map((pr) =>
                this.networkModuleManager.addRoutingTablePeer(pr.peerId, pr.blockchainId),
            ),
        );
    }

    async handleNodeRemovedEvents(blockEvents) {
        await Promise.all(
            blockEvents.map(async (event) => {
                const eventData = JSON.parse(event.data);

                const nodeId = this.blockchainModuleManager.convertHexToAscii(
                    event.blockchainId,
                    eventData.nodeId,
                );

                this.logger.trace(`Removing peer id: ${nodeId} from sharding table.`);

                await this.repositoryModuleManager.removePeerRecord(event.blockchainId, nodeId);
                this.networkModuleManager.removeRoutingTablePeer(nodeId);
            }),
        );
    }

    async handleStakeIncreasedEvents(blockEvents) {
        await Promise.all(
            blockEvents.map(async (event) => {
                const eventData = JSON.parse(event.data);

                const nodeId = this.blockchainModuleManager.convertHexToAscii(
                    event.blockchainId,
                    eventData.nodeId,
                );

                this.logger.trace(`Updating stake value for peer id: ${nodeId} in sharding table.`);

                await this.repositoryModuleManager.updatePeerStake(
                    nodeId,
                    event.blockchainId,
                    this.blockchainModuleManager.convertFromWei(
                        event.blockchainId,
                        eventData.newStake,
                    ),
                );
            }),
        );
    }

    async handleStakeWithdrawalStartedEvents(blockEvents) {
        await this.handleStakeIncreasedEvents(blockEvents);
    }

    async handleAskUpdatedEvents(blockEvents) {
        await Promise.all(
            blockEvents.map(async (event) => {
                const eventData = JSON.parse(event.data);

                const nodeId = this.blockchainModuleManager.convertHexToAscii(
                    event.blockchainId,
                    eventData.nodeId,
                );

                this.logger.trace(`Updating ask value for peer id: ${nodeId} in sharding table.`);

                await this.repositoryModuleManager.updatePeerAsk(
                    nodeId,
                    event.blockchainId,
                    this.blockchainModuleManager.convertFromWei(event.blockchainId, eventData.ask),
                );
            }),
        );
    }

    async handleServiceAgreementV1ExtendedEvents(blockEvents) {
        await Promise.all(
            blockEvents.map(async (event) => {
                const { agreementId, epochsNumber } = JSON.parse(event.data);

                return this.repositoryModuleManager.updateServiceAgreementEpochsNumber(
                    agreementId,
                    epochsNumber,
                );
            }),
        );
    }

    async handleServiceAgreementV1TerminatedEvents(blockEvents) {
        await this.repositoryModuleManager.removeServiceAgreements(
            blockEvents.map((event) => JSON.parse(event.data).agreementId),
        );
    }

    async handleStateFinalizedEvents(blockEvents) {
        // todo: find a way to safely parallelize this
        for (const event of blockEvents) {
            const eventData = JSON.parse(event.data);

            const { tokenId, keyword, hashFunctionId, state, stateIndex } = eventData;
            const blockchain = event.blockchainId;
            const contract = eventData.assetContract;
            this.logger.trace(
                `Handling event: ${event.event} for asset with ual: ${this.ualService.deriveUAL(
                    blockchain,
                    contract,
                    tokenId,
                )} with keyword: ${keyword}, assertion id: ${state}.`,
            );

            // eslint-disable-next-line no-await-in-loop
            await Promise.all([
                this.pendingStorageService.moveAndDeletePendingState(
                    TRIPLE_STORE_REPOSITORIES.PUBLIC_CURRENT,
                    TRIPLE_STORE_REPOSITORIES.PUBLIC_HISTORY,
                    PENDING_STORAGE_REPOSITORIES.PUBLIC,
                    blockchain,
                    contract,
                    tokenId,
                    keyword,
                    hashFunctionId,
                    state,
                    stateIndex,
                ),
                this.pendingStorageService.moveAndDeletePendingState(
                    TRIPLE_STORE_REPOSITORIES.PRIVATE_CURRENT,
                    TRIPLE_STORE_REPOSITORIES.PRIVATE_HISTORY,
                    PENDING_STORAGE_REPOSITORIES.PRIVATE,
                    blockchain,
                    contract,
                    tokenId,
                    keyword,
                    hashFunctionId,
                    state,
                    stateIndex,
                ),
            ]);

            // eslint-disable-next-line no-await-in-loop
            const paranetsBlockchains = await this.repositoryModuleManager.getParanetsBlockchains();

            if (paranetsBlockchains.includes(blockchain)) {
                // eslint-disable-next-line no-await-in-loop
                const knowledgeAssetId = await this.paranetService.constructKnowledgeAssetId(
                    blockchain,
                    contract,
                    tokenId,
                );

                // eslint-disable-next-line no-await-in-loop
                const paranetId = await this.blockchainModuleManager.getParanetId(
                    blockchain,
                    knowledgeAssetId,
                );
                if (paranetId && paranetId !== ZERO_BYTES32) {
                    // eslint-disable-next-line no-await-in-loop
                    const paranetExists = await this.repositoryModuleManager.paranetExists(
                        paranetId,
                        blockchain,
                    );
                    if (paranetExists) {
                        const {
                            paranetKAStorageContract: paranetKasContract,
                            tokenId: paranetTokenId,
                        } =
                            // eslint-disable-next-line no-await-in-loop
                            await this.blockchainModuleManager.getKnowledgeAssetLocatorFromParanetId(
                                blockchain,
                                paranetId,
                            );
                        const paranetUAL = this.ualService.deriveUAL(
                            blockchain,
                            paranetKasContract,
                            paranetTokenId,
                        );

                        // eslint-disable-next-line no-await-in-loop
                        const paranetAssetExists = await this.tripleStoreService.paranetAssetExists(
                            blockchain,
                            contract,
                            tokenId,
                            paranetKasContract,
                            paranetTokenId,
                        );

                        if (paranetAssetExists) {
                            const kaUAL = this.ualService.deriveUAL(blockchain, contract, tokenId);

                            // Create a record for missing Paranet KA
                            // Paranet sync command will get it from network
                            // eslint-disable-next-line no-await-in-loop
                            await this.repositoryModuleManager.createMissedParanetAssetRecord({
                                blockchainId: blockchain,
                                ual: kaUAL,
                                paranetUal: paranetUAL,
                                knowledgeAssetId,
                            });
                        }
                    }
                }
            }
        }
    }
}

export default BlockchainEventListenerService;
