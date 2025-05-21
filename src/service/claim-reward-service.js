class ClaimRewardService {
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
        this.logger.info('[CLAIM REWARD] Initializing ClaimRewardService');
        const promises = [];
        for (const blockchainId of this.blockchainModuleManager.getImplementationNames()) {
            this.logger.info(
                `[CLAIM REWARD] Initializing claim reward service for blockchain ${blockchainId}`,
            );
            promises.push(this.claimRewardMechanism(blockchainId));
        }
        await Promise.all(promises);
        this.logger.info('[CLAIM REWARD] ClaimRewardService initialization completed');
    }
}

export default ClaimRewardService;
