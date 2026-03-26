class FinalityStatusRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.model = models.finality_status;
    }

    async getFinalityAcksCount(ual, options) {
        return this.model.count({
            where: { ual },
            ...options,
        });
    }

    async saveFinalityAck(operationId, ual, peerId, options) {
        return this.model.upsert({ operationId, ual, peerId }, options);
    }

    async getPublishOperationIdByUal(ual, options) {
        const record = await this.model.findOne({
            where: { ual },
            attributes: ['operationId'],
            ...options,
        });
        return record?.operationId ?? null;
    }
}

export default FinalityStatusRepository;
