class EpochRewardsClaimedRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.model = models.epoch_rewards_claimed;
    }

    async createEpochRewardsClaimedRepositoryRecord(epochRewardsClaimed, options) {
        return this.model.create(epochRewardsClaimed, options);
    }

    async updateEpochRewardsClaimedRepositoryRecord(epochRewardsClaimed, options) {
        return this.model.update(epochRewardsClaimed, options);
    }

    async getNonClaimedClaimRewardsServiceRecordsForBlockchainId(blockchainId) {
        return this.model.findOne({
            where: {
                blockchainId,
                claimed: false,
            },
            order: [['createdAt', 'DESC']],
        });
    }

    async deleteEpochRewardsClaimedRepositoryRecord(id, options = {}) {
        return this.model.destroy({
            where: { id },
            ...options,
        });
    }
}

export default EpochRewardsClaimedRepository;
