import { PROOFING_INTERVAL } from '../constants/constants.js';

class ProofingService {
    constructor(ctx) {
        this.ctx = ctx;
        this.logger = ctx.logger;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
    }

    async initialize() {
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(`Initializing proofing service for blockchain ${blockchainId}`);
            promises.push(this.proofingMechanism(blockchainId));
        }
        await Promise.all(promises);
    }

    async proofingMechanism(blockchainId) {
        // Flag to track if mechanism is running
        let isRunning = false;

        // Set up interval
        const interval = setInterval(async () => {
            // Skip if already running
            if (isRunning) {
                this.logger.debug(
                    `Proofing mechanism for ${blockchainId} still running, skipping this interval`,
                );
                return;
            }

            try {
                isRunning = true;
                // Your proofing logic here
                await this.runProofing(blockchainId);
            } catch (error) {
                this.logger.error(
                    `Error in proofing mechanism for ${blockchainId}: ${error.message}`,
                );
            } finally {
                isRunning = false;
            }
        }, PROOFING_INTERVAL);

        // Store interval reference for cleanup
        this[`${blockchainId}Interval`] = interval;

        // Run immediately on startup
        try {
            isRunning = true;
            await this.runProofing(blockchainId);
        } catch (error) {
            this.logger.error(
                `Error in initial proofing run for ${blockchainId}: ${error.message}`,
            );
        } finally {
            isRunning = false;
        }
    }

    // Add method for actual proofing logic
    async runProofing(blockchainId) {
        // Implement your proofing logic here
        this.logger.debug(`Running proofing mechanism for ${blockchainId}`);
        // Check wat is current proof period
        // Check what is your latest chalange
        // If chalange passed get new
    }

    // Add cleanup method to stop intervals
    cleanup() {
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            const intervalKey = `${blockchainId}Interval`;
            if (this[intervalKey]) {
                clearInterval(this[intervalKey]);
                this[intervalKey] = null;
            }
        }
    }
}

export default ProofingService;
