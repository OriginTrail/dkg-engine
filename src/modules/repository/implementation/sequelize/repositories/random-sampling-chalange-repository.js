class RandomSamplingChallengeRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.model = models.random_sampling_challenge;
    }

    async createRandomSamplingChallengeRecord(randomSamplingChallenge, options) {
        return this.model.create(randomSamplingChallenge, options);
    }

    async updateRandomSamplingChallengeRecord(randomSamplingChallenge, options) {
        return this.model.update(randomSamplingChallenge, options);
    }

    async getLatestRandomSamplingChallengeRecordForBlockchainId(blockchainId, limit = 1) {
        return this.model.findAll({
            where: {
                blockchainId,
            },
            order: [['createdAt', 'DESC']], // Should this be camel case ?
            limit,
        });
    }

    async deleteRandomSamplingChallengeRecord(randomSamplingChallenge, options) {
        return this.model.destroy(randomSamplingChallenge, options);
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

export default RandomSamplingChallengeRepository;
