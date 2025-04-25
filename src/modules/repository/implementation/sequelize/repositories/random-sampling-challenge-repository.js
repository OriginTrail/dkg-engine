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

    async setCompletedAndScoreRandomSamplingChallengeRecord(
        randomSamplingChallengeId,
        completed,
        score,
        options,
    ) {
        return this.model.update(
            { sentSuccessfully: completed, score },
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

    async deleteRandomSamplingChallengeRecord(ids, options) {
        const whereConditions = Object.entries(ids)
            .map(([key]) => `${key} = :${key}`)
            .join(' AND ');

        return this.model.sequelize.query(
            `DELETE FROM random_sampling_challenges WHERE ${whereConditions}`,
            {
                replacements: ids,
                type: this.model.sequelize.QueryTypes.DELETE,
                ...options,
            },
        );
    }

    async deleteRandomSamplingChallengeForBlockchainIdEpoch(blockchainId, epoch) {
        return this.model.destroy({
            where: {
                blockchainId,
                epoch,
            },
        });
    }
}

export default RandomSamplingChallengeRepository;
