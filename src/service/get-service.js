import { Mutex } from 'async-mutex';
import OperationService from './operation-service.js';
import {
    OPERATION_ID_STATUS,
    NETWORK_PROTOCOLS,
    ERROR_TYPE,
    OPERATIONS,
    OPERATION_REQUEST_STATUS,
    GET_BATCH_SIZE,
    GET_MIN_NUM_OF_NODE_REPLICATIONS,
} from '../constants/constants.js';

class GetService extends OperationService {
    constructor(ctx) {
        super(ctx);

        this.operationName = OPERATIONS.GET;
        this.networkProtocols = NETWORK_PROTOCOLS.GET;
        this.errorType = ERROR_TYPE.GET.GET_ERROR;
        this.completedStatuses = [
            OPERATION_ID_STATUS.GET.GET_FETCH_FROM_NODES_END,
            OPERATION_ID_STATUS.GET.GET_END,
            OPERATION_ID_STATUS.COMPLETED,
        ];
        this.operationMutex = new Mutex();
    }

    async processResponse(command, responseStatus, responseData) {
        const {
            operationId,
            blockchain,
            numberOfFoundNodes,
            leftoverNodes,
            batchSize,
            minAckResponses,
            assertionId,
        } = command.data;

        const responseStatusesFromDB = await this.getResponsesStatuses(
            responseStatus,
            responseData.errorMessage,
            operationId,
        );

        const { completedNumber, failedNumber } = responseStatusesFromDB[operationId];

        const totalResponses = completedNumber + failedNumber;
        const isAllNodesResponded = numberOfFoundNodes === totalResponses;
        const isBatchCompleted = totalResponses % batchSize === 0;

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
            completedNumber === minAckResponses
        ) {
            await this.markOperationAsCompleted(operationId, blockchain, responseData, [
                ...this.completedStatuses,
            ]);
            this.logResponsesSummary(completedNumber, failedNumber);
        } else if (completedNumber < minAckResponses && (isAllNodesResponded || isBatchCompleted)) {
            const potentialCompletedNumber = completedNumber + leftoverNodes.length;

            // Still possible to meet minAckResponses, schedule leftover nodes
            if (leftoverNodes.length > 0 && potentialCompletedNumber >= minAckResponses) {
                await this.scheduleOperationForLeftoverNodes(command.data, leftoverNodes);
            } else {
                // Not enough potential responses to meet minAckResponses, or no leftover nodes
                this.markOperationAsFailed(
                    operationId,
                    blockchain,
                    `Unable to find assertion ${assertionId} on the network!`,
                    this.errorType,
                );
                this.emitChangeEvent(OPERATION_ID_STATUS.GET.GET_FAILED, operationId);
                this.logResponsesSummary(completedNumber, failedNumber);
            }
        }
    }

    getBatchSize(batchSize = null) {
        return batchSize ?? GET_BATCH_SIZE;
    }

    getMinAckResponses(minimumNumberOfNodeReplications = null) {
        return minimumNumberOfNodeReplications ?? GET_MIN_NUM_OF_NODE_REPLICATIONS;
    }
}

export default GetService;
