import { setTimeout } from 'timers/promises';
import {
    SYNC_INTERVAL,
    OPERATION_ID_STATUS,
    DKG_METADATA_PREDICATES,
} from '../constants/constants.js';

class SyncService {
    constructor(ctx) {
        this.ctx = ctx;
        this.logger = ctx.logger;
        this.ualService = ctx.ualService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.tripleStoreService = ctx.tripleStoreService;
        this.validationService = ctx.validationService;
        this.commandExecutor = ctx.commandExecutor;
        this.operationIdService = ctx.operationIdService;
        this.operationIdService = ctx.operationIdService;
    }

    async initialize() {
        this.logger.info('[DKG SYNC] Initializing SyncService');

        const blockchainIds = this.blockchainModuleManager.getImplementationNames();
        const promises = await Promise.all(
            blockchainIds.map(async (blockchainId) => {
                this.logger.info(
                    `[DKG SYNC] Initializing sync service for blockchain ${blockchainId}`,
                );

                // Check if operationalDB has all contract present in hub
                const contracts =
                    this.blockchainModuleManager.getAssetStorageContractsAddress(blockchainId);
                const dbContracts = await this.repositoryModuleManager.getKCStorageContracts(
                    blockchainId,
                );

                const missingContracts = contracts.filter(
                    (contract) =>
                        !dbContracts.some(
                            (dbContract) => dbContract.toJSON().contract_address === contract,
                        ),
                );

                if (missingContracts.length > 0) {
                    this.logger.info(
                        `[DKG SYNC] Adding missing contracts for blockchain ${blockchainId}: ${missingContracts.join(
                            ', ',
                        )}`,
                    );
                    await this.repositoryModuleManager.addSyncContracts(
                        blockchainId,
                        missingContracts,
                    );
                }

                return this.syncMechanism(blockchainId);
            }),
        );

        await Promise.all(promises);
        this.logger.info('[DKG SYNC] SyncService initialization completed');
    }

    async syncMechanism(blockchainId) {
        this.logger.debug(`[DKG SYNC] Setting up sync mechanism for blockchain ${blockchainId}`);
        // Flag to track if mechanism is running
        let isRunning = false;

        // Set up interval
        const interval = setInterval(async () => {
            // Skip if already running
            if (isRunning) {
                this.logger.debug(
                    `[DKG SYNC] Sync mechanism for ${blockchainId} still running, skipping this interval`,
                );
                return;
            }

            try {
                isRunning = true;
                this.logger.debug(`[DKG SYNC] Starting sync cycle for blockchain ${blockchainId}`);

                // Proofing logic
                await this.runSync(blockchainId);
                this.logger.debug(`[DKG SYNC] Completed sync cycle for blockchain ${blockchainId}`);
            } catch (error) {
                this.logger.error(
                    `[DKG SYNC] Error in sync mechanism for ${blockchainId}: ${error.message}, stack: ${error.stack}`,
                );
            } finally {
                isRunning = false;
            }
        }, SYNC_INTERVAL);

        // Store interval reference for cleanup
        this[`${blockchainId}Interval`] = interval;
        this.logger.info(`[DKG SYNC] Sync mechanism initialized for blockchain ${blockchainId}`);
    }

    async runSync(blockchainId) {
        this.logger.debug(`[DKG SYNC] Running sync for blockchain ${blockchainId}`);
        const syncRecords = (
            await this.repositoryModuleManager.getSyncRecordForBlockchain(blockchainId)
        ).map((syncRecord) => syncRecord.toJSON());
        const latestKnowledgeCollectionIds = {};

        const knowledgeCollectionResults = await Promise.all(
            syncRecords.map(async (syncRecord) => {
                const latestKnowledgeCollectionId =
                    await this.blockchainModuleManager.getLatestKnowledgeCollectionId(
                        blockchainId,
                        syncRecord.contractAddress,
                    );

                if (latestKnowledgeCollectionId.toNumber() > syncRecord.latestSyncedKc) {
                    return {
                        contractAddress: syncRecord.contractAddress,
                        latestKnowledgeCollectionId,
                        latestSyncedKc: syncRecord.latestSyncedKc,
                    };
                }
                return null;
            }),
        );

        // Filter out null results and build the latestKnowledgeCollectionIds object
        knowledgeCollectionResults.forEach((result) => {
            if (result !== null) {
                latestKnowledgeCollectionIds[result.contractAddress] = {
                    latestKnowledgeCollectionId: result.latestKnowledgeCollectionId,
                    latestSyncedKc: result.latestSyncedKc,
                };
            }
        });

        // Now find those that are missing construct uals:
        const SYNC_BATCH_SIZE = 10; // Or inject this from config

        const contractPromises = Object.entries(latestKnowledgeCollectionIds).map(
            async ([contractAddress, syncObject]) => {
                const uals = [];
                const { latestSyncedKc } = syncObject;
                const latestKnowledgeCollectionId =
                    syncObject.latestKnowledgeCollectionId.toNumber();

                // Calculate upper bound
                const maxId = Math.min(
                    latestKnowledgeCollectionId,
                    latestSyncedKc + SYNC_BATCH_SIZE,
                );

                // Generate UALs from (latestSyncedKc + 1) to maxId
                for (let id = latestSyncedKc + 1; id <= maxId; id += 1) {
                    const ual = this.ualService.deriveUAL(blockchainId, contractAddress, id);
                    uals.push(ual);
                }

                console.log(`Generated UALs for contract ${contractAddress}:`, uals);

                if (uals.length === 0) {
                    this.logger.info(`[DKG SYNC] No UALs to sync for blockchain ${blockchainId}`);
                    return;
                }

                const batcGetOperationId = await this.operationIdService.generateOperationId(
                    OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_START,
                );

                this.commandExecutor.add({
                    name: 'batchGetCommand',
                    sequence: [],
                    delay: 0,
                    data: {
                        operationId: batcGetOperationId,
                        uals,
                        blockchain: blockchainId,
                        includeMetadata: true,
                        contentType: 'all',
                    },
                    transactional: false,
                });

                const BATCH_GET_MAX_ATTEMPTS = 30;
                let attempt = 0;
                let batchGetResult;

                // Poll for result
                while (attempt < BATCH_GET_MAX_ATTEMPTS) {
                    // eslint-disable-next-line no-await-in-loop
                    await setTimeout(500);
                    // eslint-disable-next-line no-await-in-loop
                    batchGetResult = await this.operationIdService.getOperationIdRecord(
                        batcGetOperationId,
                    );
                    attempt += 1;

                    if (
                        batchGetResult?.status === OPERATION_ID_STATUS.FAILED ||
                        batchGetResult?.status === OPERATION_ID_STATUS.COMPLETED
                    ) {
                        break;
                    }
                }

                if (batchGetResult?.status !== OPERATION_ID_STATUS.COMPLETED) {
                    throw new Error(
                        `[SYNC] Unable to Batch GET Knowledge Collection for blockchain: ${blockchainId}, GET result: ${JSON.stringify(
                            batchGetResult,
                        )}`,
                    );
                }

                let insertFailed = false;
                const data = await this.operationIdService.getCachedOperationIdData(
                    batcGetOperationId,
                );
                console.log(JSON.stringify(data, null, 2));

                if (Object.values(data.remote).length > 0) {
                    // Update metadata timestamps
                    const updatedMetadata = { ...data.metadata };
                    Object.entries(updatedMetadata).forEach(([ual, triples]) => {
                        updatedMetadata[ual] = triples.map((triple) => {
                            if (triple.includes(DKG_METADATA_PREDICATES.PUBLISH_TIME)) {
                                const splitTriple = triple.split(' ');
                                return `${splitTriple[0]} ${
                                    splitTriple[1]
                                } "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`;
                            }
                            return triple;
                        });
                    });
                    data.metadata = updatedMetadata;

                    try {
                        await this.tripleStoreService.insertKnowledgeCollectionBatch('dkg', data);
                    } catch (error) {
                        this.logger.error(
                            `[SYNC] Unable to insert Knowledge Collection for blockchain: ${blockchainId}`,
                        );
                        insertFailed = true;
                    }
                }

                const missingUals = insertFailed
                    ? uals.filter(
                          (ual) =>
                              !data.local.includes(ual) && !(data.remote[ual]?.public?.length > 0),
                      )
                    : uals.filter((ual) => !data.local.includes(ual));

                const insertRecords = missingUals.map((ual) => {
                    const { knowledgeCollectionId, contract } = this.ualService.resolveUAL(ual);
                    return {
                        kcId: knowledgeCollectionId,
                        contractAddress: contract,
                    };
                });

                const transaction = await this.repositoryModuleManager.transaction();
                try {
                    if (insertRecords.length > 0) {
                        const error = 'KC not found on network';
                        await this.repositoryModuleManager.insertMissedKc(
                            blockchainId,
                            insertRecords,
                            error,
                            { transaction },
                        );
                    }
                    await this.repositoryModuleManager.updateLatestSyncedKc(
                        blockchainId,
                        contractAddress,
                        latestSyncedKc + uals.length,
                        { transaction },
                    );
                    await transaction.commit();
                } catch (error) {
                    await transaction.rollback();
                    throw error;
                }
            },
        );

        await Promise.all(contractPromises);
    }

    // Add cleanup method to stop intervals
    cleanup() {}
}

export default SyncService;
