import { Sequelize } from 'sequelize';

class TriplesInsertCountRepository {
    constructor(models) {
        this.model = models.triples_insert_count;
    }

    async getCount() {
        const record = await this.model.findOne();
        return record?.count || 0;
    }

    async increment(by = 1, options = {}) {
        await this.model.upsert(
            {
                id: 1,
                count: Sequelize.literal(`COALESCE(count, 0) + ${by}`),
            },
            {
                ...options,
            },
        );
    }
}

export default TriplesInsertCountRepository;
