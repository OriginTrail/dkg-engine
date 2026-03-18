import OperationService from './operation-service.js';

import {
    OPERATION_ID_STATUS,
    NETWORK_PROTOCOLS,
    ERROR_TYPE,
    OPERATIONS,
} from '../constants/constants.js';

class UpdateService extends OperationService {
    constructor(ctx) {
        super(ctx);

        this.repositoryModuleManager = ctx.repositoryModuleManager;

        this.operationName = OPERATIONS.UPDATE;
        this.networkProtocols = NETWORK_PROTOCOLS.UPDATE;
        this.errorType = ERROR_TYPE.UPDATE.UPDATE_ERROR;
        this.completedStatuses = [
            OPERATION_ID_STATUS.UPDATE.UPDATE_REPLICATE_END,
            OPERATION_ID_STATUS.UPDATE.UPDATE_END,
            OPERATION_ID_STATUS.COMPLETED,
        ];
    }

    async processResponse(command, responseStatus, responseData, errorMessage = null) {
        const {
            operationId,
            blockchain,
            numberOfFoundNodes,
            leftoverNodes,
            batchSize,
            minAckResponses,
            datasetRoot,
        } = command.data;

        const datasetRootStatus = await this.getResponsesStatuses(
            responseStatus,
            errorMessage,
            operationId,
        );

        const { completedNumber, failedNumber } = datasetRootStatus[operationId];

        const totalResponses = completedNumber + failedNumber;

        this.logger.debug(
            `Processing ${
                this.operationName
            } response with status: ${responseStatus} for operationId: ${operationId}. Total number of nodes: ${numberOfFoundNodes}, number of nodes in batch: ${Math.min(
                numberOfFoundNodes,
                batchSize,
            )} number of leftover nodes: ${
                leftoverNodes.length
            }, number of responses: ${totalResponses}, Completed: ${completedNumber}, Failed: ${failedNumber}, minimum replication factor: ${minAckResponses}`,
        );
        if (responseData.errorMessage) {
            this.logger.trace(
                `Error message for operation id: ${operationId} : ${responseData.errorMessage}`,
            );
        }

        // Minimum replication reached, mark in the operational DB
        if (completedNumber === minAckResponses) {
            this.logger.debug(
                `Minimum replication ${minAckResponses} reached for operationId: ${operationId}, dataset root: ${datasetRoot}`,
            );

            await this.repositoryModuleManager.updateMinAcksReached(operationId, true);
        }

        // All requests sent, minimum replication reached, mark as completed
        if (leftoverNodes.length === 0 && completedNumber >= minAckResponses) {
            await this.markOperationAsCompleted(
                operationId,
                blockchain,
                null,
                this.completedStatuses,
            );
            this.logResponsesSummary(completedNumber, failedNumber);
        }

        // All requests sent, minimum replication not reached, mark as failed
        if (leftoverNodes.length === 0 && completedNumber < minAckResponses) {
            this.markOperationAsFailed(
                operationId,
                blockchain,
                'Not replicated to enough nodes!',
                this.errorType,
            );
            this.logResponsesSummary(completedNumber, failedNumber);
        }

        // Not all requests sent, still possible to reach minimum replication,
        // schedule requests for leftover nodes
        const potentialCompletedNumber = completedNumber + leftoverNodes.length;
        if (leftoverNodes.length > 0 && potentialCompletedNumber >= minAckResponses) {
            await this.scheduleOperationForLeftoverNodes(command.data, leftoverNodes);
        }
    }
}

export default UpdateService;
