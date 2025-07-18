import { kcTools } from 'assertion-tools';
import { setTimeout } from 'timers/promises';
import {
    PROOFING_INTERVAL,
    REORG_PROOFING_BUFFER,
    PRIVATE_HASH_SUBJECT_PREFIX,
    CHUNK_SIZE,
    OPERATION_ID_STATUS,
    TRIPLES_VISIBILITY,
    PROOFING_MAX_ATTEMPTS,
} from '../constants/constants.js';

class ProofingService {
    constructor(ctx) {
        this.ctx = ctx;
        this.logger = ctx.logger;
        this.ualService = ctx.ualService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.networkModuleManager = ctx.networkModuleManager;
        this.tripleStoreService = ctx.tripleStoreService;
        this.validationService = ctx.validationService;
        this.commandExecutor = ctx.commandExecutor;
        this.operationIdService = ctx.operationIdService;
    }

    async initialize() {
        this.logger.info('[PROOFING] Initializing ProofingService');
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(
                `[PROOFING] Initializing proofing service for blockchain ${blockchainId}`,
            );
            promises.push(this.proofingMechanism(blockchainId));
        }
        await Promise.all(promises);
        this.logger.info('[PROOFING] ProofingService initialization completed');
    }

    async proofingMechanism(blockchainId) {
        this.logger.debug(
            `[PROOFING] Setting up proofing mechanism for blockchain ${blockchainId}`,
        );
        // Flag to track if mechanism is running
        let isRunning = false;

        // Set up interval
        const interval = setInterval(async () => {
            // Skip if already running
            if (isRunning) {
                this.logger.debug(
                    `[PROOFING] Proofing mechanism for ${blockchainId} still running, skipping this interval`,
                );
                return;
            }

            try {
                isRunning = true;
                this.logger.debug(
                    `[PROOFING] Starting proofing cycle for blockchain ${blockchainId}`,
                );

                // Proofing logic
                await this.runProofing(blockchainId);
                this.logger.debug(
                    `[PROOFING] Completed proofing cycle for blockchain ${blockchainId}`,
                );
            } catch (error) {
                this.logger.error(
                    `[PROOFING] Error in proofing mechanism for ${blockchainId}: ${error.message}, stack: ${error.stack}`,
                );
            } finally {
                isRunning = false;
            }
        }, PROOFING_INTERVAL);

        // Store interval reference for cleanup
        this[`${blockchainId}Interval`] = interval;
        this.logger.info(
            `[PROOFING] Proofing mechanism initialized for blockchain ${blockchainId}`,
        );
    }

    async runProofing(blockchainId) {
        this.logger.debug(`[PROOFING] Running proofing mechanism for ${blockchainId}`);

        const peerId = this.networkModuleManager.getPeerId().toB58String();
        const isNodePartOfShard = await this.repositoryModuleManager.isNodePartOfShard(
            blockchainId,
            peerId,
        );
        if (!isNodePartOfShard) {
            this.logger.debug(
                `[PROOFING] Skipping proofing. Node is not part of shard for blockchain: ${blockchainId}, peerId: ${peerId}`,
            );
            return;
        }

        const identityId = await this.blockchainModuleManager.getIdentityId(blockchainId);
        // Check what is current proof period {isValid, activeProofPeriodStartBlock}
        const activeProofPeriodStatus =
            await this.blockchainModuleManager.getActiveProofPeriodStatus(blockchainId);
        const latestChallenge =
            await this.repositoryModuleManager.getLatestRandomSamplingChallengeRecordForBlockchainId(
                blockchainId,
            );

        this.logger.debug(
            `[PROOFING] Checking proof period validity: isValid=${activeProofPeriodStatus.isValid}, activeProofPeriodStartBlock=${activeProofPeriodStatus.activeProofPeriodStartBlock}, latestChallengeBlock=${latestChallenge?.activeProofPeriodStartBlock}, sentSuccessfully=${latestChallenge?.sentSuccessfully}, blockchainId=${blockchainId}`,
        );

        if (
            activeProofPeriodStatus.isValid &&
            latestChallenge?.activeProofPeriodStartBlock ===
                activeProofPeriodStatus.activeProofPeriodStartBlock.toNumber()
        ) {
            if (latestChallenge.sentSuccessfully) {
                if (!latestChallenge.finalized) {
                    this.logger.debug(
                        `[PROOFING] Processing non-finalized challenge for blockchain: ${blockchainId}`,
                    );

                    // We have latest challenge and we sent valid proof
                    // Check onchain if it has score
                    const score = await this.blockchainModuleManager.getNodeEpochProofPeriodScore(
                        blockchainId,
                        identityId,
                        latestChallenge.epoch,
                        latestChallenge.activeProofPeriodStartBlock,
                    );
                    this.logger.debug(
                        `[PROOFING] Retrieved node score for blockchain: ${blockchainId}, identityId: ${identityId}, score: ${score.toString()}`,
                    );

                    // If score is greater than 0 than proof was sent and was valid
                    // Ensure no reorgs happened by checking if it has score and enough time has passed and if possible mark it as finalized
                    if (score.gt(0)) {
                        // Sent more than minute ago check onchain confirm it finalized and it's good
                        if (
                            latestChallenge.updatedAt.getTime() + REORG_PROOFING_BUFFER <=
                            Date.now()
                        ) {
                            this.logger.info(
                                `[PROOFING] Finalizing challenge for blockchainId: ${blockchainId}, challengeId: ${latestChallenge.id}`,
                            );
                            latestChallenge.finalized = true;
                            await this.repositoryModuleManager.setCompletedAndFinalizedRandomSamplingChallengeRecord(
                                latestChallenge.id,
                                true,
                                true,
                            );
                            this.operationIdService.emitChangeEvent(
                                'PROOF_CHALANGE_FINALIZED',
                                this.generateOperationId(
                                    blockchainId,
                                    latestChallenge.epoch.toNumber(),
                                    latestChallenge.activeProofPeriodStartBlock.toNumber(),
                                ),
                                blockchainId,
                                latestChallenge.epoch.toNumber(),
                                latestChallenge.activeProofPeriodStartBlock.toNumber(),
                            );
                        } else {
                            this.logger.info(
                                `[PROOFING] Waiting for reorg buffer to pass before finalizing for blockchain: ${blockchainId}, challengeId: ${latestChallenge.id}`,
                            );
                        }
                    } else {
                        this.logger.warn(
                            `[PROOFING] Zero score detected, resetting challenge status for blockchain: ${blockchainId}, challengeId: ${latestChallenge.id}`,
                        );
                        latestChallenge.sentSuccessfully = false;
                        latestChallenge.finalized = false;
                        await this.repositoryModuleManager.setCompletedAndFinalizedRandomSamplingChallengeRecord(
                            latestChallenge,
                        );
                        await this.prepareAndSendProof(blockchainId, identityId);
                    }
                }
            } else {
                const ual = this.ualService.deriveUAL(
                    blockchainId,
                    latestChallenge.contractAddress,
                    latestChallenge.knowledgeCollectionId,
                );

                const data = await this.fetchAndProcessAssertion(blockchainId, ual);

                this.operationIdService.emitChangeEvent(
                    'PROOF_ASSERTION_FETCHED',
                    this.generateOperationId(
                        blockchainId,
                        latestChallenge.epoch.toNumber(),
                        latestChallenge.activeProofPeriodStartBlock.toNumber(),
                    ),
                    blockchainId,
                    latestChallenge.epoch.toNumber(),
                    latestChallenge.activeProofPeriodStartBlock.toNumber(),
                );

                if (data.public.length === 0) {
                    this.logger.warn(
                        `[PROOFING] No assertions found for blockchain: ${blockchainId}, challengeId: ${latestChallenge.id}, ual: ${ual}`,
                    );
                    return;
                }

                const proof = await this.calculateAndSubmitProof(
                    data,
                    latestChallenge,
                    blockchainId,
                );
                this.logger.info(
                    `[PROOFING] Proof calculated and submitted successfully for blockchain: ${blockchainId}, challengeId: ${latestChallenge.id}`,
                );

                return proof;
            }
            // If finalized is do nothing, wait for next proof
        } else {
            this.logger.info(`[PROOFING] Preparing new proof for blockchain: ${blockchainId}`);
            // Node needs to get new challenge or Node sent wrong proof
            await this.prepareAndSendProof(blockchainId, identityId);
        }
    }

    async prepareAndSendProof(blockchainId, identityId) {
        this.logger.debug(`[PROOFING] Starting proof preparation for blockchain: ${blockchainId}`);

        try {
            const newChallenge = await this.getAndPersistNewChallenge(blockchainId, identityId);

            const ual = this.ualService.deriveUAL(
                blockchainId,
                newChallenge.contractAddress,
                newChallenge.knowledgeCollectionId,
            );

            this.logger.debug(
                `[PROOFING] New challenge created: challengeId=${newChallenge.id}, epoch=${newChallenge.epoch}, contractAddress=${newChallenge.contractAddress}, knowledgeCollectionId=${newChallenge.knowledgeCollectionId}`,
            );

            const data = await this.fetchAndProcessAssertion(blockchainId, ual);

            this.operationIdService.emitChangeEvent(
                'PROOF_ASSERTION_FETCHED',
                this.generateOperationId(
                    blockchainId,
                    newChallenge.epoch.toNumber(),
                    newChallenge.activeProofPeriodStartBlock.toNumber(),
                ),
                blockchainId,
                newChallenge.epoch.toNumber(),
                newChallenge.activeProofPeriodStartBlock.toNumber(),
            );

            if (data.public.length === 0) {
                throw new Error(
                    `[PROOFING] No assertions found for blockchain: ${blockchainId}, ual: ${ual}`,
                );
            }

            const proof = await this.calculateAndSubmitProof(data, newChallenge, blockchainId);
            this.logger.info(
                `[PROOFING] Proof calculated and submitted successfully for blockchain: ${blockchainId}, challengeId: ${newChallenge.id}`,
            );

            return proof;
        } catch (error) {
            this.logger.error(
                `[PROOFING] Failed to prepare and send proof for blockchain: ${blockchainId}. Error: ${error.message}, stack: ${error.stack}`,
            );
            throw error;
        }
    }

    async getAndPersistNewChallenge(blockchainId, identityId) {
        // Node has challenge for previous period need to get new one
        // Get new challenge
        const createChallengeResult = await this.blockchainModuleManager.createChallenge(
            blockchainId,
        );

        if (
            !createChallengeResult.success &&
            !createChallengeResult?.error?.message?.includes(
                'An unsolved challenge already exists for this node in the current proof period',
            )
        ) {
            // Throw an error only if it's not the expected "already exists" error
            throw new Error(createChallengeResult.error);
        }

        const newChallenge = await this.blockchainModuleManager.getNodeChallenge(
            blockchainId,
            identityId,
        );

        if (createChallengeResult.success) {
            // Only emit the event if a new challenge was actually generated
            this.operationIdService.emitChangeEvent(
                'PROOF_NEW_CHALANGE_GENERATED',
                this.generateOperationId(
                    blockchainId,
                    newChallenge.epoch.toNumber(),
                    newChallenge.activeProofPeriodStartBlock.toNumber(),
                ),
                blockchainId,
                newChallenge.epoch.toNumber(),
                newChallenge.activeProofPeriodStartBlock.toNumber(),
            );
        }

        const newChallengeRecord = {
            blockchainId,
            epoch: newChallenge.epoch.toNumber(),
            activeProofPeriodStartBlock: newChallenge.activeProofPeriodStartBlock.toNumber(),
            contractAddress: newChallenge.knowledgeCollectionStorageContract.toLowerCase(),
            knowledgeCollectionId: newChallenge.knowledgeCollectionId.toNumber(),
            chunkNumber: newChallenge.chunkId.toNumber(),
            sentSuccessfully: false,
            finalized: false,
        };
        const newRecord = await this.repositoryModuleManager.createRandomSamplingChallengeRecord(
            newChallengeRecord,
        );
        this.operationIdService.emitChangeEvent(
            'PROOF_NEW_CHALANGE_PERSISTED',
            this.generateOperationId(
                blockchainId,
                newChallenge.epoch.toNumber(),
                newChallenge.activeProofPeriodStartBlock.toNumber(),
            ),
            blockchainId,
            newChallenge.epoch.toNumber(),
            newChallenge.activeProofPeriodStartBlock.toNumber(),
        );
        return newRecord;
    }

    async fetchAndProcessAssertion(blockchainId, ual) {
        let attempt = 0;
        let getResult;
        const getOperationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.GET.GET_START,
        );
        this.operationIdService.emitChangeEvent(
            'PROOFING_GET_STARTED',
            getOperationId,
            blockchainId,
        );
        this.logger.debug(
            `[PROOFING] Proofing GET started for blockchain: ${blockchainId}, operationId: ${getOperationId}`,
        );

        const { contract, knowledgeCollectionId } = this.ualService.resolveUAL(ual);
        await this.commandExecutor.add({
            name: 'getCommand',
            sequence: [],
            delay: 0,
            data: {
                operationId: getOperationId,
                blockchain: blockchainId,
                contract,
                knowledgeCollectionId,
                state: 0,
                ual,
                contentType: TRIPLES_VISIBILITY.PUBLIC,
            },
            transactional: false,
        });

        do {
            // eslint-disable-next-line no-await-in-loop
            await setTimeout(500);
            // eslint-disable-next-line no-await-in-loop
            getResult = await this.operationIdService.getOperationIdRecord(getOperationId);
            attempt += 1;
        } while (
            attempt < PROOFING_MAX_ATTEMPTS &&
            getResult?.status !== OPERATION_ID_STATUS.FAILED &&
            getResult?.status !== OPERATION_ID_STATUS.COMPLETED
        );

        if (getResult?.status !== OPERATION_ID_STATUS.COMPLETED) {
            // We need to stop here and retry later
            throw new Error(
                `[PROOFING] Unable to Proofing GET Knowledge Collection for proof Id: ${knowledgeCollectionId}, for contract: ${contract}, blockchain: ${blockchainId}, GET result: ${JSON.stringify(
                    getResult,
                )}`,
            );
        }

        const { assertion } = await this.operationIdService.getCachedOperationIdData(
            getOperationId,
        );

        this.logger.debug(
            `[PROOFING] Proofing GET: ${assertion.public.length} nquads found for asset with ual: ${ual}`,
        );

        return assertion;
    }

    async calculateAndSubmitProof(data, challenge, blockchainId) {
        const publicAssertion = data.public;

        const filteredPublic = [];
        const privateHashTriples = [];
        publicAssertion.forEach((triple) => {
            if (triple.startsWith(`<${PRIVATE_HASH_SUBJECT_PREFIX}`)) {
                privateHashTriples.push(triple);
            } else {
                filteredPublic.push(triple);
            }
        });

        let publicKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
            filteredPublic,
            true,
        );
        publicKnowledgeAssetsTriplesGrouped.push(
            ...kcTools.groupNquadsBySubject(privateHashTriples, true),
        );

        publicKnowledgeAssetsTriplesGrouped = publicKnowledgeAssetsTriplesGrouped
            .map((t) => t.sort())
            .flat();

        // Calculate proof
        const proof = kcTools.calculateMerkleProof(
            publicKnowledgeAssetsTriplesGrouped,
            CHUNK_SIZE,
            challenge.chunkNumber,
        );
        // Submit proof
        // How to validate result? (we do it in next iteration)
        const chunks = kcTools.splitIntoChunks(publicKnowledgeAssetsTriplesGrouped);
        const chunk = chunks[challenge.chunkNumber];
        await this.blockchainModuleManager.submitProof(blockchainId, chunk, proof.proof);
        this.operationIdService.emitChangeEvent(
            'PROOF_SUBMITTED',
            this.generateOperationId(
                blockchainId,
                challenge.epoch,
                challenge.activeProofPeriodStartBlock,
            ),
            blockchainId,
            null,
            null,
        );
        const score = await this.blockchainModuleManager.getNodeEpochProofPeriodScore(
            blockchainId,
            await this.blockchainModuleManager.getIdentityId(blockchainId),
            challenge.epoch,
            challenge.activeProofPeriodStartBlock,
        );

        if (score.gt(0)) {
            // Move score persistence to finalization
            await this.repositoryModuleManager.setCompletedAndScoreRandomSamplingChallengeRecord(
                challenge.id,
                true,
                BigInt(score.toString()), // eslint-disable-line no-undef
            );
            this.operationIdService.emitChangeEvent(
                'PROOF_SUBMITTED_SUCCESSFULLY',
                this.generateOperationId(
                    blockchainId,
                    challenge.epoch,
                    challenge.activeProofPeriodStartBlock,
                ),
                blockchainId,
                null,
                null,
            );
        }

        return proof;
    }

    generateOperationId(blockchainId, epoch, activeProofPeriodStartBlock) {
        return `${blockchainId}-${epoch}-${activeProofPeriodStartBlock}`;
    }

    // Add cleanup method to stop intervals
    cleanup() {
        this.logger.info('[PROOFING] Starting ProofingService cleanup');
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            const intervalKey = `${blockchainId}Interval`;
            if (this[intervalKey]) {
                this.logger.debug(`Clearing interval for blockchain ${blockchainId}`);
                clearInterval(this[intervalKey]);
                this[intervalKey] = null;
            }
        }
        this.logger.info('[PROOFING] ProofingService cleanup completed');
    }
}

export default ProofingService;
