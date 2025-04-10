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

    async setCompletedRandomSamplingChallengeRecord(randomSamplingChallengeId, completed, options) {
        return this.model.update(
            { completed },
            { where: { id: randomSamplingChallengeId }, ...options },
        );
    }

    async setCompletedAndFinalizedRandomSamplingChallengeRecord(
        randomSamplingChallengeId,
        completed,
        finalized,
        options,
    ) {
        return this.model.update(
            { completed, finalized },
            { where: { id: randomSamplingChallengeId }, ...options },
        );
    }

    async getLatestRandomSamplingChallengeRecordForBlockchainId(blockchainId) {
        return this.model.findOne({
            where: {
                blockchainId,
            },
            order: [['createdAt', 'DESC']], // Should this be camel case ?
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
