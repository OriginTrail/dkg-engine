import { SYNC_INTERVAL } from '../constants/constants.js';

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
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(`[DKG SYNC] Initializing sync service for blockchain ${blockchainId}`);
            promises.push(this.syncMechanism(blockchainId));
        }
        await Promise.all(promises);
        this.logger.info('[DKG SYNC] SyncService initialization completed');
    }

    async proofingMechanism(blockchainId) {
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
                await this.runProofing(blockchainId);
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

        // Run immediately on startup
        try {
            isRunning = true;
            this.logger.debug(
                `[DKG SYNC] Running initial sync cycle for blockchain ${blockchainId}`,
            );
            await this.runSync(blockchainId);
        } catch (error) {
            this.logger.error(
                `[DKG SYNC] Error in initial sync run for ${blockchainId}: ${error.message}, stack: ${error.stack}`,
            );
            this.operationIdService.emitChangeEvent(
                'SYNC_ERROR',
                this.generateOperationId(blockchainId, 0, 0),
                blockchainId,
                error.message,
                error.stack,
            );
        } finally {
            isRunning = false;
        }
    }

    async runSync(blockchainId) {
        this.logger.debug(`[DKG SYNC] Running sync for blockchain ${blockchainId}`);
    }

    // Add cleanup method to stop intervals
    cleanup() {}
}

export default SyncService;
