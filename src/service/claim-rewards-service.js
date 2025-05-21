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
        this.operationIdService = ctx.operationIdService;
    }

    async initialize() {
        this.logger.info('[CLAIM REWARDS] Initializing ClaimRewardsService');
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(
                `[CLAIM REWARDS] Initializing claim rewards service for blockchain ${blockchainId}`,
            );
            promises.push(this.claimRewardsMechanism(blockchainId));
        }
        await Promise.all(promises);
        this.logger.info('[CLAIM REWARDS] ClaimRewardsService initialization completed');
    }
}

export default ClaimRewardsService;
