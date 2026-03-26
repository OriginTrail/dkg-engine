import OperationService from './operation-service.js';
import {
    OPERATION_ID_STATUS,
    NETWORK_PROTOCOLS,
    ERROR_TYPE,
    OPERATIONS,
    OPERATION_REQUEST_STATUS,
    FINALITY_BATCH_SIZE,
    FINALITY_MIN_NUM_OF_NODE_REPLICATIONS,
} from '../constants/constants.js';

class FinalityService extends OperationService {
    constructor(ctx) {
        super(ctx);

        this.operationName = OPERATIONS.FINALITY;
        this.networkProtocols = NETWORK_PROTOCOLS.FINALITY;
        this.errorType = ERROR_TYPE.FINALITY.FINALITY_ERROR;
        this.completedStatuses = [
            OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_END,
            OPERATION_ID_STATUS.COMPLETED,
        ];
        this.ualService = ctx.ualService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.paranetService = ctx.paranetService;
    }

    async processResponse(operationId, blockchain, responseStatus, responseData) {
        const responseStatusesFromDB = await this.getResponsesStatuses(
            responseStatus,
            responseData.errorMessage,
            operationId,
        );

        const { completedNumber, failedNumber } = responseStatusesFromDB[operationId];

        this.logger.debug(
            `Processing ${this.operationName} response with status: ${responseStatus} for operationId: ${operationId}. ` +
                `Completed: ${completedNumber}, Failed: ${failedNumber}`,
        );
        if (responseData.errorMessage) {
            this.logger.trace(
                `Error message for operation id: ${operationId} : ${responseData.errorMessage}`,
            );
        }

        if (responseStatus === OPERATION_REQUEST_STATUS.COMPLETED) {
            await this.markOperationAsCompleted(
                operationId,
                blockchain,
                {
                    completedNodes: 1,
                    allNodesReplicatedData: true,
                },
                [...this.completedStatuses],
            );
            this.logResponsesSummary(completedNumber, failedNumber);
        } else {
            await this.markOperationAsFailed(
                operationId,
                blockchain,
                `Unable to send ACK for finalization!`,
                this.errorType,
            );
            this.logResponsesSummary(completedNumber, failedNumber);
        }
    }

    getBatchSize(batchSize = null) {
        return batchSize ?? FINALITY_BATCH_SIZE;
    }

    getMinAckResponses(minimumNumberOfNodeReplications = null) {
        return minimumNumberOfNodeReplications ?? FINALITY_MIN_NUM_OF_NODE_REPLICATIONS;
    }
}

export default FinalityService;
