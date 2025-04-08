class TriplesInsertCountRepository {
    constructor(models) {
        this.model = models.triples_insert_count;
    }

    async getCount() {
        const record = await this.model.findOne();
        return record?.count || 0;
    }

    async increment(by = 1) {
        const [record] = await this.model.findOrCreate({ where: {}, defaults: { count: 0 } });
        record.count += by;
        await record.save();
    }

    async reset() {
        await this.model.update({ count: 0 }, { where: {} });
    }
}

export default TriplesInsertCountRepository;
