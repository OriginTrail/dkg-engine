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

    async deleteEpochRewardsClaimedRepositoryRecord(id, options = {}) {
        return this.model.destroy({
            where: { id },
            ...options,
        });
    }
}

export default EpochRewardsClaimedRepository;
