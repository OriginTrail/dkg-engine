import {
    NETWORK_SIGNATURES_FOLDER,
    OPERATION_ID_STATUS,
    PUBLISHER_NODE_SIGNATURES_FOLDER,
} from '../../../constants/constants.js';
import BaseController from '../base-http-api-controller.js';

class ResultController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.operationIdService = ctx.operationIdService;
        this.signatureService = ctx.signatureService;

        this.availableOperations = ['publish', 'get', 'query', 'update', 'ask', 'finality'];
    }

    async handleRequest(req, res) {
        if (!this.availableOperations.includes(req.params.operation)) {
            return this.returnResponse(res, 400, {
                code: 400,
                message: `Unsupported operation: ${req.params.operation}, available operations are: ${this.availableOperations}`,
            });
        }

        const { operationId, operation } = req.params;
        if (!this.operationIdService.operationIdInRightFormat(operationId)) {
            return this.returnResponse(res, 400, {
                code: 400,
                message: `Operation id: ${operationId} is in wrong format`,
            });
        }

        try {
            const handlerRecord = await this.operationIdService.getOperationIdRecord(operationId);

            if (handlerRecord) {
                const response = {
                    status: handlerRecord.status,
                };
                if (handlerRecord.status === OPERATION_ID_STATUS.FAILED) {
                    response.data = JSON.parse(handlerRecord.data);
                }

                switch (operation) {
                    case 'get':
                    case 'query':
                    case 'finality':
                        if (handlerRecord.status === OPERATION_ID_STATUS.COMPLETED) {
                            response.data = await this.operationIdService.getCachedOperationIdData(
                                operationId,
                            );
                        }
                        break;
                    case 'publish':
                    case 'update': {
                        const minAcksReached = handlerRecord.minAcksReached || false;
                        response.data = { ...response.data, minAcksReached };
                        const shouldIncludeSignatures =
                            minAcksReached ||
                            handlerRecord.status === OPERATION_ID_STATUS.COMPLETED;
                        if (shouldIncludeSignatures) {
                            try {
                                const publisherNodeSignature = (
                                    await this.signatureService.getSignaturesFromStorage(
                                        PUBLISHER_NODE_SIGNATURES_FOLDER,
                                        operationId,
                                    )
                                )[0];
                                const signatures =
                                    await this.signatureService.getSignaturesFromStorage(
                                        NETWORK_SIGNATURES_FOLDER,
                                        operationId,
                                    );
                                response.data = {
                                    ...response.data,
                                    minAcksReached: true,
                                    publisherNodeSignature,
                                    signatures,
                                };
                            } catch (e) {
                                this.logger.warn(
                                    `Failed to read signatures for operationId ${operationId}: ${e.message}`,
                                );
                            }
                        }
                        break;
                    }
                    case 'ask':
                        response.data = await this.operationIdService.getCachedOperationIdData(
                            operationId,
                        );
                        break;
                    default:
                        break;
                }

                return this.returnResponse(res, 200, response);
            }
            return this.returnResponse(res, 400, {
                code: 400,
                message: `Handler with id: ${operationId} does not exist.`,
            });
        } catch (e) {
            this.logger.error(
                `Error while trying to fetch ${operation} data for operation id ${operationId}. Error message: ${e.message}. ${e.stack}`,
            );

            return this.returnResponse(res, 400, {
                code: 400,
                message: `Unexpected error at getting results: ${e.message}`,
            });
        }
    }
}

export default ResultController;
