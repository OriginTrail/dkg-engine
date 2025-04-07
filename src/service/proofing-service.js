import { setTimeout } from 'timers/promises';
import { kcTools } from 'assertion-tools';
import {
    PROOFING_INTERVAL,
    TRIPLES_VISIBILITY,
    TRIPLE_STORE_REPOSITORY,
    OPERATION_ID_STATUS,
    PROOFING_MAX_ATTEMPTS,
} from '../constants/constants.js';

class ProofingService {
    constructor(ctx) {
        this.ctx = ctx;
        this.logger = ctx.logger;
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
        this[`${blockchainId}`].interval = interval;

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
        // Check what is current proof period
        const isProofPeriodValid = await this.blockchainModuleManager.isActiveProofPeriodStillValid(
            blockchainId,
        );
        const latestChallenge =
            await this.repositoryModuleManager.getActiveRandomSamplingChallengeRecord(blockchainId);
        // We have latest challenge and we sent valid proof
        if (
            isProofPeriodValid.isValid &&
            latestChallenge.proofPeriod === isProofPeriodValid.proofPeriod &&
            latestChallenge.sentSuccessfully
        ) {
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
                if (!latestChallenge.finalized) {
                    // Sent more than minute ago check onchain confirm it finalized and it's good
                    if (latestChallenge.updatedAt.getTime() + 12 * 1000 >= Date.now()) {
                        // Check onchain if it should be finalized
                        latestChallenge.finalized = true;
                        await this.repositoryModuleManager.updateRandomSamplingChallengeRecord(
                            latestChallenge,
                        );
                    } else {
                        latestChallenge.sentSuccessfully = false;
                        latestChallenge.finalized = false;
                        await this.repositoryModuleManager.deleteRandomSamplingChallengeRecord(
                            latestChallenge,
                        );
                        // Retry proof (same logic as in top else block below)
                    }
                }
                // Score is 0, proof was not sent or was invalid, node thinks it sent valid proof
            } else {
                latestChallenge.sentSuccessfully = false;
                latestChallenge.finalized = false;
                await this.repositoryModuleManager.updateRandomSamplingChallengeRecord(
                    latestChallenge,
                );
                // Retry proof (same logic as in top else block below)
            }
        } else {
            const ual = this.ualService.deriveUAL(
                blockchainId,
                latestChallenge.contractAddress,
                latestChallenge.knowledgeCollectionId,
            );
            // Node has challenge for previous period need to get new one
            // Get new chalange
            const newChallenge = await this.blockchainModuleManager.getNewChallenge(blockchainId);
            // Persist new challenge
            await this.repositoryModuleManager.createRandomSamplingChallengeRecord(newChallenge);

            // Calculate knowledgeAssetId like we do in get command
            let knowledgeAssetId;
            try {
                knowledgeAssetId = await this.blockchainModuleManager.getKnowledgeAssetsRange(
                    blockchainId,
                    latestChallenge.contractAddress,
                    latestChallenge.knowledgeCollectionId,
                );
            } catch (error) {
                // Asset created on old content asset storage contract
                knowledgeAssetId = {
                    startTokenId: 1,
                    endTokenId: 1,
                    burned: [],
                };
            }

            let assertion = await this.tripleStoreService.getAssertion(
                blockchainId,
                latestChallenge.contractAddress,
                latestChallenge.knowledgeCollectionId,
                knowledgeAssetId,
                TRIPLES_VISIBILITY.PUBLIC,
                TRIPLE_STORE_REPOSITORY.DKG,
            );
            let isAssertionValid = false;
            if (!assertion && assertion.public?.length > 0) {
                isAssertionValid = await this.validationService.validateGetResponse(
                    assertion,
                    blockchainId,
                    latestChallenge.contractAddress,
                    latestChallenge.knowledgeCollectionId,
                    knowledgeAssetId,
                );
            }
            if (!isAssertionValid) {
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
                // #endregion NETWORK END

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
                if (assertion && assertion?.public?.length > 0) {
                    // TODO: Do this correctly
                    await this.tripleStoreService.deleteKnowledgeCollection(
                        TRIPLE_STORE_REPOSITORY.DKG,
                        ual,
                    );
                    assertion = data.assertion;
                }
            }
            // Calculate proof
            const proof = kcTools.calculateProof(assertion, newChallenge);
            // Submit proof
            // How to validate result?
            await this.blockchainModuleManager.submitProof(blockchainId, proof);
        }
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
