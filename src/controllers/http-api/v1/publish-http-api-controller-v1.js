import BaseController from '../base-http-api-controller.js';
import {
    ERROR_TYPE,
    OPERATION_ID_STATUS,
    OPERATION_STATUS,
    LOCAL_STORE_TYPES,
    COMMAND_PRIORITY,
    PUBLISH_MIN_NUM_OF_NODE_REPLICATIONS,
} from '../../../constants/constants.js';

class PublishController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.operationService = ctx.publishService;
        this.operationIdService = ctx.operationIdService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.pendingStorageService = ctx.pendingStorageService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
    }

    async handleRequest(req, res) {
        const { dataset, datasetRoot, blockchain, minimumNumberOfNodeReplications } = req.body;

        this.logger.info(
            `Received asset with dataset root: ${datasetRoot}, blockchain: ${blockchain}`,
        );

        const operationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_START,
            blockchain,
        );

        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_INIT_START,
            operationId,
            blockchain,
        );

        this.returnResponse(res, 202, {
            operationId,
        });

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_INIT_END,
        );
        await this.repositoryModuleManager.createOperationRecord(
            this.operationService.getOperationName(),
            operationId,
            OPERATION_STATUS.IN_PROGRESS,
        );

        try {
            await this.operationIdService.cacheOperationIdDataToMemory(operationId, {
                dataset,
                datasetRoot,
            });

            await this.operationIdService.cacheOperationIdDataToFile(operationId, {
                dataset,
                datasetRoot,
            });

            let effectiveMinReplications = minimumNumberOfNodeReplications;
            let chainMinNumber = null;
            try {
                const chainMin = await this.blockchainModuleManager.getMinimumRequiredSignatures(
                    blockchain,
                );
                chainMinNumber = Number(chainMin);
            } catch (err) {
                this.logger.warn(
                    `Failed to fetch on-chain minimumRequiredSignatures for ${blockchain}: ${err.message}`,
                );
            }

            const userMinNumber = Number(effectiveMinReplications);
            const resolvedUserMin =
                !Number.isNaN(userMinNumber) && userMinNumber > 0
                    ? userMinNumber
                    : PUBLISH_MIN_NUM_OF_NODE_REPLICATIONS;

            if (!Number.isNaN(chainMinNumber) && chainMinNumber > 0) {
                effectiveMinReplications = Math.max(chainMinNumber, resolvedUserMin);
            } else {
                effectiveMinReplications = resolvedUserMin;
            }

            if (effectiveMinReplications === 0) {
                this.logger.error(
                    `Effective minimum replications resolved to 0 for operationId: ${operationId}, blockchain: ${blockchain}. This should never happen.`,
                );
            }

            const publisherNodePeerId = this.networkModuleManager.getPeerId().toB58String();
            await this.pendingStorageService.cacheDataset(
                operationId,
                datasetRoot,
                dataset,
                publisherNodePeerId,
            );

            const commandSequence = ['publishReplicationCommand'];

            await this.commandExecutor.add({
                name: commandSequence[0],
                sequence: commandSequence.slice(1),
                data: {
                    datasetRoot,
                    blockchain,
                    operationId,
                    storeType: LOCAL_STORE_TYPES.TRIPLE,
                    minimumNumberOfNodeReplications: effectiveMinReplications,
                },
                transactional: false,
                priority: COMMAND_PRIORITY.HIGHEST,
            });
        } catch (error) {
            this.logger.error(
                `Error while initializing publish data: ${error.message}. ${error.stack}`,
            );

            await this.operationService.markOperationAsFailed(
                operationId,
                blockchain,
                'Unable to publish data, Failed to process input data!',
                ERROR_TYPE.PUBLISH.PUBLISH_ROUTE_ERROR,
            );
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.PUBLISH.PUBLISH_FAILED,
                operationId,
            );
        }
    }
}

export default PublishController;
