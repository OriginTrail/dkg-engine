import Sequelize from 'sequelize';

class ParanetKcRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.model = models.paranet_kc;
    }

    async createParanetKcRecords(paranetUal, blockchainId, uals, options = {}) {
        return this.model.bulkCreate(
            uals.map((ual) => ({ paranetUal, blockchainId, ual, isSynced: false })),
            options,
        );
    }

    async getCount(paranetUal, options = {}) {
        return this.model.count({
            where: {
                paranetUal,
            },
            ...options,
        });
    }

    async getCountSynced(paranetUal, options = {}) {
        return this.model.count({
            where: {
                paranetUal,
                isSynced: true,
            },
            ...options,
        });
    }

    async getCountUnsynced(paranetUal, options = {}) {
        return this.model.count({
            where: {
                paranetUal,
                isSynced: false,
            },
            ...options,
        });
    }

    async getSyncBatch(paranetUal, maxRetries, delayInMs, limit = null, options = {}) {
        const queryOptions = {
            where: {
                paranetUal,
                isSynced: false,
                [Sequelize.Op.and]: [
                    { retries: { [Sequelize.Op.lt]: maxRetries } },
                    {
                        [Sequelize.Op.or]: [
                            { retries: 0 },
                            {
                                updatedAt: {
                                    [Sequelize.Op.lte]: new Date(Date.now() - delayInMs),
                                },
                            },
                        ],
                    },
                ],
            },
            order: [['retries', 'DESC']],
            ...options,
        };

        if (limit !== null) {
            queryOptions.limit = limit;
        }

        return this.model.findAll(queryOptions);
    }

    async incrementRetries(paranetUal, ual, errorMessage = null, options = {}) {
        const [affectedRows] = await this.model.increment('retries', {
            by: 1,
            where: {
                ual,
                paranetUal,
                errorMessage,
            },
            ...options,
        });

        return affectedRows;
    }

    async markAsSynced(paranetUal, ual, options = {}) {
        const [affectedRows] = await this.model.update(
            { isSynced: true },
            {
                where: {
                    ual,
                    paranetUal,
                },
                ...options,
            },
        );

        return affectedRows;
    }
}

export default ParanetKcRepository;
