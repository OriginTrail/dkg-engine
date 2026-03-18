import OperationService from './operation-service.js';
import {
    OPERATION_ID_STATUS,
    NETWORK_PROTOCOLS,
    ERROR_TYPE,
    OPERATIONS,
    OPERATION_REQUEST_STATUS,
    ASK_BATCH_SIZE,
} from '../constants/constants.js';

class AskService extends OperationService {
    constructor(ctx) {
        super(ctx);

        this.operationName = OPERATIONS.ASK;
        this.networkProtocols = NETWORK_PROTOCOLS.ASK;
        this.errorType = ERROR_TYPE.ASK.ASK_ERROR;
        this.completedStatuses = [
            OPERATION_ID_STATUS.ASK.ASK_FETCH_FROM_NODES_END,
            OPERATION_ID_STATUS.ASK.ASK_END,
            OPERATION_ID_STATUS.COMPLETED,
        ];
    }

    async processResponse(command, responseStatus, responseData) {
        const { operationId, blockchain, numberOfFoundNodes, leftoverNodes, batchSize } =
            command.data;

        const responseStatusesFromDB = await this.getResponsesStatuses(
            responseStatus,
            responseData.errorMessage,
            operationId,
        );

        const { completedNumber, failedNumber } = responseStatusesFromDB[operationId];

        const totalResponses = completedNumber + failedNumber;
        const isAllNodesResponded = numberOfFoundNodes === totalResponses;
        const isBatchCompleted = totalResponses % batchSize === 0;

        const minimumNumberOfNodeReplications =
            command.data.minimumNumberOfNodeReplications ?? numberOfFoundNodes;

        this.logger.debug(
            `Processing ${
                this.operationName
            } response with status: ${responseStatus} for operationId: ${operationId}. Total number of nodes: ${numberOfFoundNodes}, number of nodes in batch: ${Math.min(
                numberOfFoundNodes,
                batchSize,
            )} number of leftover nodes: ${
                leftoverNodes.length
            }, number of responses: ${totalResponses}, Completed: ${completedNumber}, Failed: ${failedNumber}`,
        );
        if (responseData.errorMessage) {
            this.logger.trace(
                `Error message for operation id: ${operationId} : ${responseData.errorMessage}`,
            );
        }

        if (
            responseStatus === OPERATION_REQUEST_STATUS.COMPLETED &&
            completedNumber === minimumNumberOfNodeReplications
        ) {
            await this.markOperationAsCompleted(
                operationId,
                blockchain,
                {
                    completedNodes: completedNumber,
                    allNodesReplicatedData: true,
                },
                [...this.completedStatuses],
            );
            this.logResponsesSummary(completedNumber, failedNumber);
        } else if (
            completedNumber < minimumNumberOfNodeReplications &&
            (isAllNodesResponded || isBatchCompleted)
        ) {
            const potentialCompletedNumber = completedNumber + leftoverNodes.length;

            await this.operationIdService.cacheOperationIdDataToFile(operationId, {
                completedNodes: completedNumber,
                allNodesReplicatedData: false,
            });

            // Still possible to meet minimumNumberOfNodeReplications, schedule leftover nodes
            if (
                leftoverNodes.length > 0 &&
                potentialCompletedNumber >= minimumNumberOfNodeReplications
            ) {
                await this.scheduleOperationForLeftoverNodes(command.data, leftoverNodes);
            } else {
                // Not enough potential responses to meet minimumNumberOfNodeReplications, or no leftover nodes
                await this.markOperationAsFailed(
                    operationId,
                    blockchain,
                    `Unable to replicate data on the network!`,
                    this.errorType,
                );
                this.logResponsesSummary(completedNumber, failedNumber);
            }
        }
    }

    getBatchSize(batchSize = null) {
        return batchSize ?? ASK_BATCH_SIZE;
    }
}

export default AskService;
