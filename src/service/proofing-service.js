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
        this.logger.info('Initializing ProofingService');
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(`Initializing proofing service for blockchain ${blockchainId}`);
            promises.push(this.proofingMechanism(blockchainId));
        }
        await Promise.all(promises);
        this.logger.info('ProofingService initialization completed');
    }

    async proofingMechanism(blockchainId) {
        this.logger.debug(`Setting up proofing mechanism for blockchain ${blockchainId}`);
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
                this.logger.debug(`Starting proofing cycle for blockchain ${blockchainId}`);

                // Your proofing logic here
                await this.runProofing(blockchainId);
                this.logger.debug(`Completed proofing cycle for blockchain ${blockchainId}`);
            } catch (error) {
                this.logger.error(
                    `Error in proofing mechanism for ${blockchainId}: ${error.message}`,
                    { error, blockchainId },
                );
            } finally {
                isRunning = false;
            }
        }, PROOFING_INTERVAL);

        // Store interval reference for cleanup
        this[`${blockchainId}Interval`] = interval;
        this.logger.info(`Proofing mechanism initialized for blockchain ${blockchainId}`);

        // Run immediately on startup
        try {
            isRunning = true;
            this.logger.debug(`Running initial proofing cycle for blockchain ${blockchainId}`);
            await this.runProofing(blockchainId);
        } catch (error) {
            this.logger.error(
                `Error in initial proofing run for ${blockchainId}: ${error.message}`,
                { error, blockchainId },
            );
        } finally {
            isRunning = false;
        }
    }

    async runProofing(blockchainId) {
        // Implement your proofing logic here
        this.logger.debug(`Running proofing mechanism for ${blockchainId}`);
        this.logger.trace('Fetching active proof period status');

        const nodeId = await this.blockchainModuleManager.getIdentityId(blockchainId);
        // Check what is current proof period {isValid, activeProofPeriodStartBlock}
        const activeProofPeriodStatus =
            await this.blockchainModuleManager.getActiveProofPeriodStatus(blockchainId);
        this.logger.trace('Fetching latest challenge record');
        const latestChallenge =
            await this.repositoryModuleManager.getLatestRandomSamplingChallengeRecordForBlockchainId(
                blockchainId,
            );

        this.logger.debug('Checking proof period validity', {
            isValid: activeProofPeriodStatus.isValid,
            activeProofPeriodStartBlock: activeProofPeriodStatus.activeProofPeriodStartBlock,
            latestChallengeBlock: latestChallenge?.activeProofPeriodStartBlock,
            sentSuccessfully: latestChallenge?.sentSuccessfully,
        });

        if (
            activeProofPeriodStatus.isValid &&
            latestChallenge?.activeProofPeriodStartBlock ===
                activeProofPeriodStatus.activeProofPeriodStartBlock &&
            latestChallenge?.sentSuccessfully
        ) {
            if (!latestChallenge.finalized) {
                this.logger.debug('Processing non-finalized challenge');

                // We have latest challenge and we sent valid proof
                // Check onchain if it has score
                const score = await this.blockchainModuleManager.getNodeEpochProofPeriodScore(
                    blockchainId,
                    nodeId,
                    latestChallenge.epoch,
                    latestChallenge.proofPeriodStartBlock,
                );
                this.logger.debug('Retrieved node score', { nodeId, score });

                // If score is greater than 0 than proof was sent and was valid
                // Ensure no reorgs happened by checking if it has score and enough time has passed and if possible mark it as finalized
                if (score > 0) {
                    // Sent more than minute ago check onchain confirm it finalized and it's good
                    if (latestChallenge.updatedAt.getTime() + REORG_PROOFING_BUFFER >= Date.now()) {
                        this.logger.info('Finalizing challenge', {
                            blockchainId,
                            challengeId: latestChallenge.id,
                        });
                        latestChallenge.finalized = true;
                        await this.repositoryModuleManager.updateRandomSamplingChallengeRecord(
                            latestChallenge,
                        );
                    } else {
                        this.logger.debug('Waiting for reorg buffer to pass before finalizing');
                    }
                } else {
                    this.logger.warn('Zero score detected, resetting challenge status', {
                        blockchainId,
                        challengeId: latestChallenge.id,
                    });
                    latestChallenge.sentSuccessfully = false;
                    latestChallenge.finalized = false;
                    await this.repositoryModuleManager.updateRandomSamplingChallengeRecord(
                        latestChallenge,
                    );
                    await this.prepareAndSendProof(blockchainId, latestChallenge, nodeId);
                }
            }
            // If finalized is do nothing, wait for next proof
        } else {
            this.logger.info('Preparing new proof', { blockchainId });
            // Node needs to get new challenge or Node sent wrong proof
            await this.prepareAndSendProof(blockchainId, latestChallenge, nodeId);
        }
    }

    async prepareAndSendProof(blockchainId, latestChallenge, nodeId) {
        this.logger.debug('Starting proof preparation', {
            blockchainId,
            challengeId: latestChallenge?.id,
        });

        try {
            const newChallenge = await this.getAndPersistNewChallenge(
                blockchainId,
                latestChallenge,
                nodeId,
            );

            const ual = this.ualService.deriveUAL(
                blockchainId,
                '0xd5724171c2b7f0aa717a324626050bd05767e2c6', // newChallenge.contractAddress,
                newChallenge.knowledgeCollectionId,
            );

            this.logger.debug('New challenge created', {
                challengeId: newChallenge.id,
                epoch: newChallenge.epoch,
                // contractAddress: newChallenge.contractAddress,
                knowledgeCollectionId: newChallenge.knowledgeCollectionId,
            });

            const data = await this.fetchAndProcessAssertion(blockchainId, ual, latestChallenge);

            const proof = await this.calculateAndSubmitProof(data, newChallenge, blockchainId);
            this.logger.info('Proof calculated and submitted successfully', {
                blockchainId,
                challengeId: newChallenge.id,
            });

            return proof;
        } catch (error) {
            this.logger.error('Failed to prepare and send proof', {
                error: error.message,
                blockchainId,
                challengeId: latestChallenge.id,
                stack: error.stack,
            });
            throw error;
        }
    }

    async getAndPersistNewChallenge(blockchainId, latestChallenge, nodeId) {
        // Node has challenge for previous period need to get new one
        // Get new challenge
        await this.blockchainModuleManager.createChallenge(blockchainId);
        const newChallenge = await this.blockchainModuleManager.getNodeChallenge(
            blockchainId,
            nodeId,
        );
        // Persist new challenge
        if (
            latestChallenge?.epoch === newChallenge.epoch &&
            latestChallenge?.activeProofPeriodStartBlock ===
                newChallenge.activeProofPeriodStartBlock
        ) {
            // Delete old challenge before inserting new one
            await this.repositoryModuleManager.deleteRandomSamplingChallengeRecord(latestChallenge);
        }
        const newChallengeRecord = {
            blockchainId,
            epoch: newChallenge.epoch.toNumber(),
            activeProofPeriodStartBlock: newChallenge.activeProofPeriodStartBlock.toNumber(),
            contractAddress: '0xd5724171c2b7f0aa717a324626050bd05767e2c6',
            knowledgeCollectionId: newChallenge.knowledgeCollectionId.toNumber(),
            chunkNumber: newChallenge.chunkId.toNumber(),
            sentSuccessfully: false,
            finalized: false,
        };
        await this.repositoryModuleManager.createRandomSamplingChallengeRecord(newChallengeRecord);
        return newChallenge;
    }

    async fetchAndProcessAssertion(blockchainId, ual, latestChallenge) {
        let attempt = 0;
        let getResult;
        const getOperationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.GET.GET_START,
        );
        // TODO: Add flag for disabling local GET as it has already been done above
        await this.commandExecutor.add({
            name: 'getCommand',
            sequence: [],
            delay: 0,
            data: {
                operationId: getOperationId,
                blockchain: blockchainId,
                contract: '0xd5724171c2b7f0aa717a324626050bd05767e2c6', // contractAddress: latestChallenge.contractAddress,
                knowledgeCollectionId: latestChallenge.knowledgeCollectionId, // latestChallenge.knowledgeCollectionId,
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
        this.logger.info('Starting ProofingService cleanup');
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            const intervalKey = `${blockchainId}Interval`;
            if (this[intervalKey]) {
                this.logger.debug(`Clearing interval for blockchain ${blockchainId}`);
                clearInterval(this[intervalKey]);
                this[intervalKey] = null;
            }
        }
        this.logger.info('ProofingService cleanup completed');
    }
}

export default ProofingService;
