import { Mutex } from 'async-mutex';
import OperationService from './operation-service.js';

import {
    OPERATION_ID_STATUS,
    NETWORK_PROTOCOLS,
    ERROR_TYPE,
    OPERATIONS,
    PUBLISH_BATCH_SIZE,
    PUBLISH_MIN_NUM_OF_NODE_REPLICATIONS,
} from '../constants/constants.js';

class PublishService extends OperationService {
    constructor(ctx) {
        super(ctx);
        this.repositoryModuleManager = ctx.repositoryModuleManager;

        this.operationName = OPERATIONS.PUBLISH;
        this.networkProtocols = NETWORK_PROTOCOLS.STORE;
        this.errorType = ERROR_TYPE.PUBLISH.PUBLISH_ERROR;
        this.completedStatuses = [
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_REPLICATE_END,
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_END,
            OPERATION_ID_STATUS.COMPLETED,
        ];
        this.operationMutex = new Mutex();
    }

    async processResponse(command, responseStatus, responseData, errorMessage = null) {
        const {
            operationId,
            blockchain,
            numberOfFoundNodes,
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
            } response with status: ${responseStatus} for operationId: ${operationId}, dataset root: ${datasetRoot}. Total number of nodes: ${numberOfFoundNodes}, number of nodes in batch: ${Math.min(
                numberOfFoundNodes,
                batchSize,
            )}, number of responses: ${totalResponses}, Completed: ${completedNumber}, Failed: ${failedNumber}, minimum replication factor: ${minAckResponses}`,
        );
        if (responseData.errorMessage) {
            this.logger.trace(
                `Error message for operation id: ${operationId}, dataset root: ${datasetRoot} : ${responseData.errorMessage}`,
            );
        }

        // 1. Check minimum replication reached
        // if (completedNumber === minAckResponses) {
        //     this.logger.debug(
        //         `Minimum replication ${minAckResponses} reached for operationId: ${operationId}, dataset root: ${datasetRoot}`,
        //     );
        //     await this.repositoryModuleManager.updateMinAcksReached(operationId, true);
        // }

        // 2. Check if all responses have been received
        if (totalResponses === numberOfFoundNodes) {
            // 2.1 If minimum replication is reached, mark the operation as completed
            if (completedNumber >= minAckResponses) {
                await this.markOperationAsCompleted(
                    operationId,
                    blockchain,
                    null,
                    this.completedStatuses,
                );
                await this.repositoryModuleManager.updateMinAcksReached(operationId, true);
                this.logResponsesSummary(completedNumber, failedNumber);
            }
            // 2.2 Otherwise, mark as failed
            else {
                await this.markOperationAsFailed(
                    operationId,
                    blockchain,
                    'Not replicated to enough nodes!',
                    this.errorType,
                );
                this.logResponsesSummary(completedNumber, failedNumber);
            }
        }
        //  else {
        //     // 3. Not all responses have arrived yet.
        //     const potentialCompletedNumber = completedNumber + leftoverNodes.length;
        //     const canStillReachMinReplication = potentialCompletedNumber >= minAckResponses;
        //     const canScheduleBatch = (totalResponses - 1) % batchSize === 0;

        //     // 3.1 Check if minimum replication can still be achieve  by scheduling leftover nodes
        //     //     (and it's at the end of a batch)
        //     // if (leftoverNodes.length > 0 && canStillReachMinReplication && canScheduleBatch) {
        //     //     await this.scheduleOperationForLeftoverNodes(command.data, leftoverNodes);
        //     // }
        //     // 3.2 If minimum replication cannot be reached and it's end of a batch, mark as failed
        //     if (!canStillReachMinReplication && canScheduleBatch) {
        //         await this.markOperationAsFailed(
        //             operationId,
        //             blockchain,
        //             'Not replicated to enough nodes!',
        //             this.errorType,
        //         );
        //         this.logResponsesSummary(completedNumber, failedNumber);
        //     }
        // }
    }

    getBatchSize(batchSize = null) {
        return batchSize ?? PUBLISH_BATCH_SIZE;
    }

    getMinAckResponses(minimumNumberOfNodeReplications = null) {
        return minimumNumberOfNodeReplications ?? PUBLISH_MIN_NUM_OF_NODE_REPLICATIONS;
    }
}

export default PublishService;
