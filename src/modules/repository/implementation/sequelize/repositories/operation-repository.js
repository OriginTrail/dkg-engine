import { Sequelize } from 'sequelize';

class OperationRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.models = {
            get: models.get,
            publish: models.publish,
            update: models.update,
            publish_paranet: models.publish_paranet,
            ask: models.ask,
            finality: models.finality,
        };
    }

    async createOperationRecord(operation, operationId, status, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[operationModel].create(
            {
                operationId,
                status,
            },
            options,
        );
    }

    async removeOperationRecords(operation, ids, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[operationModel].destroy({
            where: {
                id: { [Sequelize.Op.in]: ids },
            },
            ...options,
        });
    }

    async findAndRemoveOperationRecords(operation, timestamp, limit, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[operationModel].destroy({
            where: {
                createdAt: { [Sequelize.Op.lte]: timestamp },
            },
            order: [['createdAt', 'asc']],
            raw: true,
            limit,
            ...options,
        });
    }

    async findProcessedOperations(operation, timestamp, limit, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[`${operationModel}`].findAll({
            where: {
                createdAt: { [Sequelize.Op.lte]: timestamp },
            },
            order: [['createdAt', 'asc']],
            raw: true,
            limit,
            ...options,
        });
    }

    async getOperationStatus(operation, operationId, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[operationModel].findOne({
            attributes: ['status'],
            where: {
                operationId,
            },
            ...options,
        });
    }

    async updateOperationStatus(operation, operationId, status, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        await this.models[operationModel].update(
            { status },
            {
                where: {
                    operationId,
                },
                ...options,
            },
        );
    }
}

export default OperationRepository;
