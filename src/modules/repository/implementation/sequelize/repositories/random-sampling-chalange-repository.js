class MissedParanetAssetRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.model = models.random_sampling_challenge;
    }

    async createRandomSamplingChallengeRecord(randomSamplingChallenge, options) {
        return this.model.create(randomSamplingChallenge, options);
    }

    async getActiveRandomSamplingChalangeForBlockchainId(blockchainId, epoch, limit = null) {
        return this.model.findAll({
            where: {
                blockchainId,
                epoch,
                sentSuccessfully: false,
            },
            order: [['updatedAt', 'DESC']], // Should this be camel case
            limit,
        });
    }

    async deleteRandomSamplingChalangeForBlockchainIdEpoch(blockchainId, epoch) {
        return this.model.destroy({
            where: {
                blockchainId,
                epoch,
            },
        });
    }
}

export default MissedParanetAssetRepository;
