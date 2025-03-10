import Sequelize from 'sequelize';

class OperationResponseRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.models = {
            get_response: models.get_response,
            publish_response: models.publish_response,
            update_response: models.update_response,
            publish_paranet_response: models.publish_paranet_response,
            ask_response: models.ask_response,
            finality_response: models.finality_response,
        };
    }

    async createOperationResponseRecord(status, operation, operationId, message, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        await this.models[`${operationModel}_response`].create(
            {
                status,
                message,
                operationId,
            },
            options,
        );
    }

    async getOperationResponsesStatuses(operation, operationId, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[`${operationModel}_response`].findAll({
            attributes: ['status'],
            where: {
                operationId,
            },
            ...options,
        });
    }

    async findProcessedOperationResponse(timestamp, limit, operation, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[`${operationModel}_response`].findAll({
            where: {
                createdAt: { [Sequelize.Op.lte]: Date(timestamp) },
            },
            order: [['createdAt', 'asc']],
            raw: true,
            limit,
            ...options,
        });
    }

    async findAndRemoveProcessedOperationResponse(operation, timestamp, limit, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        return this.models[`${operationModel}_response`].destroy({
            where: {
                createdAt: { [Sequelize.Op.lte]: timestamp },
            },
            limit,
            ...options,
        });
    }

    async removeOperationResponse(ids, operation, options) {
        const operationModel = operation.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        await this.models[`${operationModel}_response`].destroy({
            where: {
                id: { [Sequelize.Op.in]: ids },
            },
            ...options,
        });
    }
}

export default OperationResponseRepository;
