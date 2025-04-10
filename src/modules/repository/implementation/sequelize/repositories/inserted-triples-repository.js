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
        const [record] = await this.model.findOrCreate({
            where: {},
            defaults: { count: 0 },
            ...options,
        });

        await this.model.update(
            {
                count: Sequelize.literal(`count + ${by}`),
            },
            {
                where: { id: record.id },
                ...options,
            },
        );
    }
}

export default TriplesInsertCountRepository;
