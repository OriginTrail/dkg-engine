import { CLAIM_REWARDS_BATCH_SIZE, CLAIM_REWARDS_INTERVAL } from '../constants/constants.js';

class ClaimRewardsService {
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
        this.logger.info('[CLAIM] Initializing ClaimRewardsService');
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(
                `[CLAIM] Initializing claim rewards service for blockchain ${blockchainId}`,
            );
            promises.push(this.claimRewardsMechanism(blockchainId));
        }
        await Promise.all(promises);
        this.logger.info('[CLAIM] ClaimRewardsService initialization completed');
    }

    async claimRewardsMechanism(blockchainId) {
        this.logger.debug(
            `[CLAIM] Setting up claim rewards mechanism for blockchain ${blockchainId}`,
        );
        // Flag to track if mechanism is running
        let isRunning = false;

        // Set up interval
        const interval = setInterval(async () => {
            // Skip if already running
            if (isRunning) {
                this.logger.debug(
                    `[CLAIM] Claim rewards mechanism for ${blockchainId} still running, skipping this interval`,
                );
                return;
            }

            try {
                isRunning = true;
                this.logger.debug(
                    `[CLAIM] Starting claim rewards cycle for blockchain ${blockchainId}`,
                );

                // Proofing logic
                await this.claimRewards(blockchainId);
                this.logger.debug(
                    `[CLAIM] Completed claim rewards cycle for blockchain ${blockchainId}`,
                );
            } catch (error) {
                this.logger.error(
                    `[CLAIM] Error in claim rewards mechanism for ${blockchainId}: ${error.message}, stack: ${error.stack}`,
                );
            } finally {
                isRunning = false;
            }
        }, CLAIM_REWARDS_INTERVAL);

        // Store interval reference for cleanup
        this[`${blockchainId}Interval`] = interval;
        this.logger.info(
            `[CLAIM] Claim rewards mechanism initialized for blockchain ${blockchainId}`,
        );

        // Run immediately on startup
        try {
            isRunning = true;
            this.logger.debug(
                `[CLAIM] Running initial claim rewards cycle for blockchain ${blockchainId}`,
            );
            await this.claimRewards(blockchainId);
        } catch (error) {
            this.logger.error(
                `[CLAIM] Error in initial claim rewards run for ${blockchainId}: ${error.message}, stack: ${error.stack}`,
            );
            // this.operationIdService.emitChangeEvent(
            //     'CLAIM_REWARDS_ERROR',
            //     this.generateOperationId(blockchainId, 0, 0),
            //     blockchainId,
            //     error.message,
            //     error.stack,
            // );
        } finally {
            isRunning = false;
        }
    }

    async claimRewards(blockchainId) {
        const identityId = await this.blockchainModuleManager.getIdentityId(blockchainId);
        const nodeDelegatorAddresses = await this.blockchainModuleManager.getDelegators(
            blockchainId,
            identityId,
        );
        const lastClaimedEpochAddressesMap = {};
        await Promise.all(
            nodeDelegatorAddresses.map(async (delegatorAddress) => {
                const lastClaimedEpoch = await this.blockchainModuleManager.getLastClaimedEpoch(
                    blockchainId,
                    identityId,
                    delegatorAddress,
                );
                if (!lastClaimedEpochAddressesMap[`${lastClaimedEpoch}`]) {
                    lastClaimedEpochAddressesMap[`${lastClaimedEpoch}`] = [];
                }
                lastClaimedEpochAddressesMap[`${lastClaimedEpoch}`].push(delegatorAddress);
            }),
        );
        const currentEpoch = Number(
            (await this.blockchainModuleManager.getCurrentEpoch(blockchainId)).toString(),
        );
        if (lastClaimedEpochAddressesMap['0'] && lastClaimedEpochAddressesMap['0'].length > 0) {
            // This means delegator never claimed for the node, but is in the list of delegators
            // This means node never claimed and delegated before introduction of random sampling
            // If he staked or claimed before the value would have been set correctly
            const delegatorAddresses = lastClaimedEpochAddressesMap['0'];
            const v81ReleaseEpoch = Number(
                (await this.blockchainModuleManager.getV81ReleaseEpoch(blockchainId)).toString(),
            );
            await Promise.all(
                delegatorAddresses.map(async (delegatorAddress) => {
                    const hasEverDelegated = await this.blockchainModuleManager.hasEverDelegated(
                        blockchainId,
                        identityId,
                        delegatorAddress,
                    );
                    // TODO: How will this impact mainnet where this function landed at same time as proofing
                    if (!hasEverDelegated) {
                        if (lastClaimedEpochAddressesMap[`${v81ReleaseEpoch - 1}`]) {
                            lastClaimedEpochAddressesMap[`${v81ReleaseEpoch - 1}`].push(
                                ...delegatorAddresses,
                            );
                        } else {
                            lastClaimedEpochAddressesMap[`${v81ReleaseEpoch - 1}`] =
                                delegatorAddresses;
                        }
                    }
                }),
            );
        }
        if (lastClaimedEpochAddressesMap[`0`]) {
            delete lastClaimedEpochAddressesMap[`0`];
        }
        const sortedEpochs = Object.keys(lastClaimedEpochAddressesMap)
            .map(Number) // convert keys to numbers
            .sort((a, b) => a - b); // sort numerically ascending

        for (let i = 0; i < sortedEpochs.length; i += 1) {
            const epoch = sortedEpochs[i];
            const delegatorAddresses = lastClaimedEpochAddressesMap[epoch.toString()];
            if (epoch + 1 !== currentEpoch) {
                for (let j = 0; j < delegatorAddresses.length; j += CLAIM_REWARDS_BATCH_SIZE) {
                    const batch = delegatorAddresses.slice(j, j + CLAIM_REWARDS_BATCH_SIZE);
                    try {
                        const batchClaimed =
                            // eslint-disable-next-line no-await-in-loop
                            await this.blockchainModuleManager.batchClaimDelegatorRewards(
                                blockchainId,
                                identityId,
                                [epoch + 1],
                                batch,
                            );
                        if (batchClaimed.success) {
                            this.logger.info(
                                `[CLAIM] Claimed rewards for batch ${batch} in epoch ${
                                    epoch + 1
                                } on ${blockchainId}`,
                            );
                            // If there are more epochs for this batch move them to next batch
                            if (lastClaimedEpochAddressesMap[`${epoch + 1}`]) {
                                lastClaimedEpochAddressesMap[`${epoch + 1}`].push(...batch);
                            } else {
                                lastClaimedEpochAddressesMap[`${epoch + 1}`] = batch;
                                // lastClaimedEpochAddressesMap[`${epoch + 1}`] didn't exist before so we need to also update sortedEpochs
                                // splice handles if i + 1 === sortedEpochs.length
                                sortedEpochs.splice(i + 1, 0, epoch + 1);
                            }
                        } else {
                            this.logger.error(
                                `[CLAIM] Error claiming rewards for batch ${batch} in epoch ${
                                    epoch + 1
                                } on ${blockchainId}`,
                                batchClaimed.error,
                            );
                        }
                    } catch (error) {
                        this.logger.error(
                            `[CLAIM] Error claiming rewards for batch ${batch} in epoch ${
                                epoch + 1
                            } on ${blockchainId}`,
                            error,
                        );
                    }
                }
            }
        }
    }
}

export default ClaimRewardsService;
