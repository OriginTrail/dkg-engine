import { setTimeout } from 'timers/promises';
import { SYNC_INTERVAL, OPERATION_ID_STATUS } from '../constants/constants.js';

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

        // Now find thos that are missing construct uals:
        const SYNC_BATCH_SIZE = 10; // Or inject this from config

        const uals = [];
        for (const [contractAddress, syncObject] of Object.entries(latestKnowledgeCollectionIds)) {
            if (uals.length > SYNC_BATCH_SIZE) {
                break;
            }
            const { latestSyncedKc } = syncObject;
            const latestKnowledgeCollectionId = syncObject.latestKnowledgeCollectionId.toNumber();

            // Calculate upper bound
            const maxId = Math.min(latestKnowledgeCollectionId, latestSyncedKc + SYNC_BATCH_SIZE);

            // Generate UALs from (latestSyncedKc + 1) to maxId
            for (let id = latestSyncedKc + 1; id <= maxId; id += 1) {
                const ual = this.ualService.deriveUAL(blockchainId, contractAddress, id);
                uals.push(ual);
            }

            console.log(`Generated UALs for contract ${contractAddress}:`, uals);
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
        do {
            // eslint-disable-next-line no-await-in-loop
            await setTimeout(500);
            // eslint-disable-next-line no-await-in-loop
            batchGetResult = await this.operationIdService.getOperationIdRecord(batcGetOperationId);
            attempt += 1;
        } while (
            attempt < BATCH_GET_MAX_ATTEMPTS &&
            batchGetResult?.status !== OPERATION_ID_STATUS.FAILED &&
            batchGetResult?.status !== OPERATION_ID_STATUS.COMPLETED
        );

        if (batchGetResult?.status !== OPERATION_ID_STATUS.COMPLETED) {
            // We need to return here and retry later
            throw new Error(
                `[SYNC] Unable to Batch GET Knowledge Collection for blockchain: ${blockchainId}, GET result: ${JSON.stringify(
                    batchGetResult,
                )}`,
            );
        }

        const data = await this.operationIdService.getCachedOperationIdData(batcGetOperationId);
        console.log(JSON.stringify(data, null, 2));
        // Insert in batch new KCs
        // Add missed KCs to the missed db (find from the response)
        // Update the sync record
        // What happens if the batch failed
    }

    // Add cleanup method to stop intervals
    cleanup() {}
}

export default SyncService;
