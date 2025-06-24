import { v4 as uuidv4 } from 'uuid';
import { setTimeout } from 'timers/promises';
import {
    SYNC_INTERVAL,
    OPERATION_ID_STATUS,
    DKG_METADATA_PREDICATES,
    TRIPLE_STORE_REPOSITORY,
    BATCH_GET_UAL_MAX_LIMIT,
    SYNC_BATCH_GET_MAX_ATTEMPTS,
    SYNC_BATCH_GET_WAIT_TIME,
} from '../constants/constants.js';

class SyncService {
    // TODO: Send getter for Neuroweb fixed on last finalised block, there should be ethers flag
    constructor(ctx) {
        this.ctx = ctx;
        this.syncConfig = ctx.config.assetSync.syncDKG;
        this.logger = ctx.logger;
        this.ualService = ctx.ualService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.tripleStoreService = ctx.tripleStoreService;
        this.validationService = ctx.validationService;
        this.commandExecutor = ctx.commandExecutor;
        this.operationIdService = ctx.operationIdService;
        this.syncStatus = {};
    }

    async initialize() {
        if (!this.syncConfig.enabled) {
            this.logger.info('[DKG SYNC] SyncService disabled');
            return;
        }

        this.logger.info('[DKG SYNC] Initializing SyncService');
        this.syncBatchSize = this.syncConfig.syncBatchSize;
        const blockchainIds = this.blockchainModuleManager.getImplementationNames();
        const promises = await Promise.all(
            blockchainIds.map(async (blockchainId) => {
                this.logger.info(
                    `[DKG SYNC] Initializing sync service for blockchain ${blockchainId}`,
                );

                // Check if operationalDB has all contract present in hub
                const contracts =
                    await this.blockchainModuleManager.getAssetStorageContractsAddress(
                        blockchainId,
                    );
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

                await this.runSync(blockchainId);
                this.logger.debug(`[DKG SYNC] Completed sync cycle for blockchain ${blockchainId}`);
            } catch (error) {
                this.logger.error(
                    `[DKG SYNC] Error in sync mechanism for ${blockchainId}: ${error.message}, stack: ${error.stack}`,
                );
                this.operationIdService.emitChangeEvent(
                    OPERATION_ID_STATUS.SYNC.SYNC_FAILED,
                    uuidv4(),
                    blockchainId,
                    error.message,
                    error.stack,
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
        // TODO: Add telemetry
        // TODO: Add onchain registring how far you have synced DKG
        this.logger.debug(`[DKG SYNC] Running sync for blockchain ${blockchainId}`);
        const syncOperationId = uuidv4();
        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.SYNC.SYNC_START,
            syncOperationId,
            blockchainId,
        );
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

                return {
                    contractAddress: syncRecord.contractAddress,
                    latestKnowledgeCollectionId,
                    latestSyncedKc: syncRecord.latestSyncedKc,
                };
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

        if (this.syncStatus && this.syncStatus[blockchainId]) {
            const totallatestKnowledgeCollectionId = Object.values(
                this.syncStatus[blockchainId],
            ).reduce((acc, curr) => acc + curr.latestKnowledgeCollectionId, 0);
            const totalLatestSyncedKc = Object.values(this.syncStatus[blockchainId]).reduce(
                (acc, curr) => acc + curr.latestSyncedKc,
                0,
            );
            const totalMissedKc = Object.values(this.syncStatus[blockchainId]).reduce(
                (acc, curr) => acc + curr.missedKc,
                0,
            );
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.SYNC.SYNC_PROGRESS_STATUS,
                syncOperationId,
                blockchainId,
                totalLatestSyncedKc,
                totalMissedKc,
                totallatestKnowledgeCollectionId,
            );

            const totalMissedKcChecked =
                !Number.isFinite(totalMissedKc) || Number.isNaN(totalMissedKc) ? 0 : totalMissedKc;
            const syncPrecentage =
                (100 * (totalLatestSyncedKc - totalMissedKcChecked)) /
                totallatestKnowledgeCollectionId;

            this.logger.info(
                `[DKG SYNC] DKG Sync for blockchain ${blockchainId} Status: ${syncPrecentage}%`,
            );
        }

        const contractPromises = Object.entries(latestKnowledgeCollectionIds).map(
            async ([contractAddress, syncObject]) => {
                // Run both sync tasks in parallel for this one contract
                await Promise.all([
                    this.syncNewKc(blockchainId, contractAddress, syncObject),
                    this.syncMissedKc(blockchainId, contractAddress),
                ]);
            },
        );

        // Run all contracts in parallel
        await Promise.all(contractPromises);
        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.SYNC.SYNC_END,
            syncOperationId,
            blockchainId,
        );
    }

    async syncNewKc(blockchainId, contractAddress, syncObject) {
        const uals = [];
        const { latestSyncedKc } = syncObject;
        const latestKnowledgeCollectionId = syncObject.latestKnowledgeCollectionId.toNumber();
        if (!this.syncStatus[blockchainId]) {
            this.syncStatus[blockchainId] = {};
        }
        if (!this.syncStatus[blockchainId][contractAddress]) {
            this.syncStatus[blockchainId][contractAddress] = {};
        }
        this.syncStatus[blockchainId][contractAddress].latestSyncedKc = latestSyncedKc;
        this.syncStatus[blockchainId][contractAddress].latestKnowledgeCollectionId =
            latestKnowledgeCollectionId;

        // Calculate upper bound
        const maxId = Math.min(
            latestKnowledgeCollectionId,
            latestSyncedKc + this.syncBatchSize,
            latestSyncedKc + BATCH_GET_UAL_MAX_LIMIT,
        );

        // Generate UALs from (latestSyncedKc + 1) to maxId
        for (let id = latestSyncedKc + 1; id <= maxId; id += 1) {
            const ual = this.ualService.deriveUAL(blockchainId, contractAddress, id);
            uals.push(ual);
        }

        if (uals.length === 0) {
            this.logger.info(`[DKG SYNC] No UALs to sync for blockchain ${blockchainId}`);
            return;
        }

        const { batchGetResult, batchGetOperationId } = await this.callBatchGet(uals, blockchainId);

        if (batchGetResult?.status !== OPERATION_ID_STATUS.COMPLETED) {
            throw new Error(
                `[DKG SYNC] Unable to Batch GET Knowledge Collection for blockchain: ${blockchainId}, GET result: ${JSON.stringify(
                    batchGetResult,
                )}`,
            );
        }

        let insertFailed = false;
        const data = await this.operationIdService.getCachedOperationIdData(batchGetOperationId);

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
                await this.tripleStoreService.insertKnowledgeCollectionBatch(
                    TRIPLE_STORE_REPOSITORY.DKG,
                    data,
                );
            } catch (error) {
                this.logger.error(
                    `[SYNC] Unable to insert Knowledge Collections for blockchain: ${blockchainId}, error: ${error.message}`,
                );
                insertFailed = true;
            }
        }

        const missingUals = uals.filter((ual) => {
            const isInLocal = data.local.includes(ual);
            const hasPublic = data.remote[ual]?.public?.length > 0;

            // Insert failed, so if it's not in local, it's a missing UAL
            if (insertFailed) {
                return !isInLocal;
            }
            // If it's not in local and has no public data, it's a missing UAL
            return !isInLocal && !hasPublic;
        });

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
    }

    async syncMissedKc(blockchainId, contract) {
        const missedKcForRetry = await this.repositoryModuleManager.getMissedKcForRetry(
            blockchainId,
            contract,
            this.syncBatchSize > BATCH_GET_UAL_MAX_LIMIT
                ? BATCH_GET_UAL_MAX_LIMIT
                : this.syncBatchSize,
        );

        const missedKcForRetryCount = await this.repositoryModuleManager.getMissedKcForRetryCount(
            blockchainId,
            contract,
        );
        if (!this.syncStatus[blockchainId]) {
            this.syncStatus[blockchainId] = {};
        }
        if (!this.syncStatus[blockchainId][contract]) {
            this.syncStatus[blockchainId][contract] = {};
        }
        this.syncStatus[blockchainId][contract].missedKc = missedKcForRetryCount;

        if (missedKcForRetry.length === 0) {
            this.logger.info(`[SYNC] No missed KC for retry for blockchain ${blockchainId}`);
            return;
        }
        // Contracut uals from object
        const missedUals = missedKcForRetry.map((missedKc) => {
            const missedKcJson = missedKc.toJSON();
            return this.ualService.deriveUAL(
                blockchainId,
                missedKcJson.contractAddress,
                missedKcJson.kcId,
            );
        });
        // Call batch get
        const { batchGetResult, batchGetOperationId } = await this.callBatchGet(
            missedUals,
            blockchainId,
        );

        if (batchGetResult?.status !== OPERATION_ID_STATUS.COMPLETED) {
            throw new Error(
                `[SYNC] Unable to Batch GET Knowledge Collection for blockchain: ${blockchainId}, GET result: ${JSON.stringify(
                    batchGetResult,
                )}`,
            );
        }

        // Insert
        let insertFailed = false;
        const data = await this.operationIdService.getCachedOperationIdData(batchGetOperationId);
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
                    `[DKG SYNC] Unable to insert Knowledge Collection for blockchain: ${blockchainId}`,
                );
                insertFailed = true;
            }
        }

        const missingUals = [];
        const syncedUals = [];

        missedUals.forEach((ual) => {
            const isLocal = data.local.includes(ual);
            const hasRemoteData = data.remote[ual]?.public?.length > 0;
            // If insert failed, and KC not locally present, add it to missed UALs
            if (insertFailed) {
                if (!isLocal) {
                    missingUals.push(ual);
                } else {
                    syncedUals.push(ual);
                }
            }
            // If insert was successful, and KC is locally present or fetched from remote node, add it to synced UALs
            else if (isLocal || hasRemoteData) {
                syncedUals.push(ual);
            } else {
                missingUals.push(ual);
            }
        });

        const recordsToUpdateForRetry = missingUals.map((ual) => {
            const { knowledgeCollectionId, contract: ualContract } =
                this.ualService.resolveUAL(ual);
            return {
                kcId: knowledgeCollectionId,
                contractAddress: ualContract,
            };
        });

        const recordsToUpdateForSuccess = syncedUals.map((ual) => {
            const { knowledgeCollectionId, contract: ualContract } =
                this.ualService.resolveUAL(ual);
            return {
                kcId: knowledgeCollectionId,
                contractAddress: ualContract,
            };
        });

        const transaction = await this.repositoryModuleManager.transaction();
        try {
            if (recordsToUpdateForRetry.length > 0) {
                await this.repositoryModuleManager.incrementRetryCount(
                    blockchainId,
                    recordsToUpdateForRetry,
                    { transaction },
                );
            }
            if (recordsToUpdateForSuccess.length > 0) {
                await this.repositoryModuleManager.setSyncedToTrue(
                    blockchainId,
                    recordsToUpdateForSuccess,
                    { transaction },
                );
            }
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    async callBatchGet(uals, blockchainId) {
        const batchGetOperationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_INIT,
            blockchainId,
        );

        await this.commandExecutor.add({
            name: 'batchGetCommand',
            sequence: [],
            delay: 0,
            data: {
                operationId: batchGetOperationId,
                uals,
                blockchain: blockchainId,
                includeMetadata: true,
                contentType: 'all',
            },
            transactional: false,
        });

        let batchGetResult;
        let attempts = 0;
        // Poll for result
        while (attempts < SYNC_BATCH_GET_MAX_ATTEMPTS) {
            // eslint-disable-next-line no-await-in-loop
            await setTimeout(SYNC_BATCH_GET_WAIT_TIME);
            // eslint-disable-next-line no-await-in-loop
            batchGetResult = await this.operationIdService.getOperationIdRecord(
                batchGetOperationId,
            );

            if (
                batchGetResult?.status === OPERATION_ID_STATUS.FAILED ||
                batchGetResult?.status === OPERATION_ID_STATUS.COMPLETED
            ) {
                break;
            }
            attempts += 1;
        }
        return { batchGetResult, batchGetOperationId };
    }

    // Add cleanup method to stop intervals
    cleanup() {}
}

export default SyncService;
