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
            this.operationIdService.emitChangeEvent(
                'CLAIM_REWARDS_ERROR',
                this.generateOperationId(blockchainId, 0, 0),
                blockchainId,
                error.message,
                error.stack,
            );
        } finally {
            isRunning = false;
        }
    }

    async claimRewards(blockchainId) {
        const identityId = await this.blockchainModuleManager.getIdentityId(blockchainId);
        const nodeDelegatorAddresses = await this.blockchainModuleManager.getNodeDelegatorAddresses(
            blockchainId,
            identityId,
        );
        const lastClaimedEpochAddressesMap = {};
        nodeDelegatorAddresses.map(async (delegatorAddress) => {
            const lastClaimedEpoch = await this.blockchainModuleManager.getLastClaimedEpoch(
                blockchainId,
                delegatorAddress,
            );
            if (!lastClaimedEpochAddressesMap[`${lastClaimedEpoch}`]) {
                lastClaimedEpochAddressesMap[`${lastClaimedEpoch}`] = [];
            }
            lastClaimedEpochAddressesMap[`${lastClaimedEpoch}`].push(delegatorAddress);
        });
        const currentEpoch = await this.blockchainModuleManager.getCurrentEpoch(blockchainId);
        if (lastClaimedEpochAddressesMap['0'] && lastClaimedEpochAddressesMap['0'].length > 0) {
            // This means delegator never claimed for the node, but is in the list of delegators
            // This means node never claimed and delegated before introduction of random sampling
            // If he staked or claimed before the value would have been set correctly
            const delegatorAddresses = lastClaimedEpochAddressesMap['0'];
            await Promise.all(
                delegatorAddresses.map(async (delegatorAddress) => {
                    const hasEverDelegated = await this.blockchainModuleManager.hasEverDelegated(
                        blockchainId,
                        identityId,
                        delegatorAddress,
                    );
                    // TODO: How will this impact mainnet where this function landed at same time as proofing
                    if (!hasEverDelegated) {
                        if (lastClaimedEpochAddressesMap[`${currentEpoch - 1}`]) {
                            lastClaimedEpochAddressesMap[`${currentEpoch - 1}`].push(
                                ...delegatorAddresses,
                            );
                        } else {
                            // This means node never claimed and delegated before introduction of random sampling
                            lastClaimedEpochAddressesMap[`${currentEpoch - 1}`] =
                                delegatorAddresses;
                        }
                    }
                }),
            );
        }
        const sortedEpochs = Object.keys(lastClaimedEpochAddressesMap)
            .map(Number) // convert keys to numbers
            .sort((a, b) => a - b); // sort numerically ascending

        for (const epoch of sortedEpochs) {
            const delegatorAddresses = lastClaimedEpochAddressesMap[epoch.toString()];
            // do something with epoch and delegatorAddresses
            if (epoch + 1 !== currentEpoch) {
                for (let i = 0; i < delegatorAddresses.length; i += CLAIM_REWARDS_BATCH_SIZE) {
                    const batch = delegatorAddresses.slice(i, i + CLAIM_REWARDS_BATCH_SIZE);
                    // TODO: Sending transaction from the node works with transaction queue, when tx is sent queue checks if theres is another one and sends it if exists
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        const batchClaimed = await this.blockchainModuleManager.claimRewards(
                            blockchainId,
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
