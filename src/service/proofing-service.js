import { setTimeout } from 'timers/promises';
import { kcTools } from 'assertion-tools';
import {
    PROOFING_INTERVAL,
    TRIPLES_VISIBILITY,
    TRIPLE_STORE_REPOSITORY,
    OPERATION_ID_STATUS,
    PROOFING_MAX_ATTEMPTS,
    REORG_PROOFING_BUFFER,
} from '../constants/constants.js';

class ProofingService {
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

    async runProofing(blockchainId) {
        // Implement your proofing logic here
        this.logger.debug(`Running proofing mechanism for ${blockchainId}`);
        // Check what is current proof period {isValid, proofPeriod}
        const isProofPeriodValid = await this.blockchainModuleManager.getActiveProofPeriodStatus(
            blockchainId,
        );
        const latestChallenge =
            await this.repositoryModuleManager.getActiveRandomSamplingChallengeRecord(blockchainId);
        if (
            isProofPeriodValid.isValid &&
            latestChallenge.proofPeriod === isProofPeriodValid.proofPeriod &&
            latestChallenge.sentSuccessfully
        ) {
            if (!latestChallenge.finalized) {
                // We have latest challenge and we sent valid proof
                // Check onchain if it has score
                const nodeId = await this.blockchainModuleManager.getIdentityId(blockchainId);
                const score = await this.blockchainModuleManager.getNodeEpochProofPeriodScore(
                    blockchainId,
                    nodeId,
                    latestChallenge.epoch,
                    latestChallenge.proofPeriodStartBlock,
                );
                // If score is greater than 0 than proof was sent and was valid
                // Ensure no reorgs happened by checking if it has score and enough time has passed and if possible mark it as finalized
                if (score > 0) {
                    // Sent more than minute ago check onchain confirm it finalized and it's good
                    if (latestChallenge.updatedAt.getTime() + REORG_PROOFING_BUFFER >= Date.now()) {
                        // Check onchain if it should be finalized
                        latestChallenge.finalized = true;
                        await this.repositoryModuleManager.updateRandomSamplingChallengeRecord(
                            latestChallenge,
                        );
                    }
                    await this.prepareAndSendProof(blockchainId, latestChallenge);
                } else {
                    // Score is 0, proof was not sent or was invalid, node thinks it sent valid proof
                    latestChallenge.sentSuccessfully = false;
                    latestChallenge.finalized = false;
                    await this.repositoryModuleManager.updateRandomSamplingChallengeRecord(
                        latestChallenge,
                    );
                    await this.prepareAndSendProof(blockchainId, latestChallenge);
                }
            }
            // If finalized is do nothing, wait for next proof
        } else {
            // Node needs to get new challenge or Node sent wrong proof
            await this.prepareAndSendProof(blockchainId, latestChallenge);
        }
    }

    async prepareAndSendProof(blockchainId, latestChallenge) {
        try {
            const ual = this.ualService.deriveUAL(
                blockchainId,
                latestChallenge.contractAddress,
                latestChallenge.knowledgeCollectionId,
            );

            const newChallenge = await this.getAndPersistNewChallenge(
                blockchainId,
                latestChallenge,
            );
            const data = await this.fetchAndProcessAssertion(blockchainId, ual, latestChallenge);

            const proof = await this.calculateAndSubmitProof(data, newChallenge, blockchainId);

            return proof;
        } catch (error) {
            this.logger.error(`Failed to prepare and send proof: ${error.message}`);
            throw error;
        }
    }

    async getAndPersistNewChallenge(blockchainId, latestChallenge) {
        // Node has challenge for previous period need to get new one
        // Get new challenge
        const newChallenge = await this.blockchainModuleManager.getNewChallenge(blockchainId);
        // Persist new challenge
        if (
            latestChallenge.epoch === newChallenge.epoch &&
            latestChallenge.proofPeriod === newChallenge.proofPeriod
        ) {
            // Delete old challenge before inserting new one
            await this.repositoryModuleManager.deleteRandomSamplingChallengeRecord(latestChallenge);
        }
        await this.repositoryModuleManager.createRandomSamplingChallengeRecord(newChallenge);

        return newChallenge;
    }

    async fetchAndProcessAssertion(blockchainId, ual, latestChallenge) {
        let attempt = 0;
        let getResult;
        const getOperationId = this.operationIdService.generateOperationId();
        // TODO: Add flag for disabling local GET as it has already been done above
        await this.commandExecutor.add({
            name: 'getCommand',
            sequence: [],
            delay: 0,
            data: {
                operationId: getOperationId,
                blockchainId,
                contractAddress: latestChallenge.contractAddress,
                knowledgeCollectionId: latestChallenge.knowledgeCollectionId,
                state: 0,
                ual,
                contentType: TRIPLES_VISIBILITY.PUBLIC,
            },
            transactional: false,
        });

        attempt = 0;
        do {
            // eslint-disable-next-line no-await-in-loop
            await setTimeout(PROOFING_INTERVAL);
            // eslint-disable-next-line no-await-in-loop
            getResult = await this.operationIdService.getOperationIdRecord(getOperationId);
            attempt += 1;
        } while (
            attempt < PROOFING_MAX_ATTEMPTS &&
            getResult?.status !== OPERATION_ID_STATUS.FAILED &&
            getResult?.status !== OPERATION_ID_STATUS.COMPLETED
        );

        if (getResult?.status !== OPERATION_ID_STATUS.COMPLETED) {
            // We need to return here and retry later
            throw new Error(
                `Unable to Proofing GET Knowledge Collection for proof Id: ${
                    latestChallenge.knowledgeCollectionId
                }, for contract: ${latestChallenge.contractAddress}, state index: ${
                    latestChallenge.stateIndex
                }, blockchain: ${blockchainId}, GET result: ${JSON.stringify(getResult)}`,
            );
        }

        const data = await this.operationIdService.getCachedOperationIdData(getOperationId);
        this.logger.debug(
            `Proofing GET: ${
                data.assertion.public.length + (data.assertion?.private?.length || 0)
            } nquads found for asset with ual: ${ual}`,
        );
        if (data.assertion && data.assertion?.public?.length > 0) {
            // TODO: Do this correctly there is no implementation of deleteKnowledgeCollection in tripleStoreService
            await this.tripleStoreService.deleteKnowledgeCollection(
                TRIPLE_STORE_REPOSITORY.DKG,
                ual,
            );
        }
        await this.tripleStoreService.insertKnowledgeCollection(
            TRIPLE_STORE_REPOSITORY.DKG,
            ual,
            data.assertion,
        );

        return data.assertion;
    }

    async calculateAndSubmitProof(data, newChallenge, blockchainId) {
        // Calculate proof
        const proof = kcTools.calculateProof(data, newChallenge);
        // Submit proof
        // How to validate result? (we do it in next iteration)
        await this.blockchainModuleManager.submitProof(blockchainId, proof);

        return proof;
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
