import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';

import {
    NETWORK_MESSAGE_TYPES,
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    COMMAND_PRIORITY,
} from '../../../../../constants/constants.js';

class HandleStoreRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.validationService = ctx.validationService;
        this.operationService = ctx.publishService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.tripleStoreService = ctx.tripleStoreService;
        this.ualService = ctx.ualService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.operationIdService = ctx.operationIdService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.signatureService = ctx.signatureService;

        this.errorType = ERROR_TYPE.PUBLISH.PUBLISH_LOCAL_STORE_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.PUBLISH.PUBLISH_LOCAL_STORE_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.PUBLISH.PUBLISH_LOCAL_STORE_REMOTE_END;
    }

    async prepareMessage(commandData) {
        const {
            blockchain,
            operationId,
            datasetRoot,
            remotePeerId,
            isOperationV0,
            contract,
            tokenId,
        } = commandData;

        // Derive UAL if possible
        const ual =
            contract && tokenId
                ? this.ualService.deriveUAL(blockchain, contract, tokenId)
                : `pending:${datasetRoot}`;

        this.logger.debug(
            `[store-request-debug] Starting prepareMessage. OperationId: ${operationId}, UAL: ${ual}, blockchain: ${blockchain}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}, isOperationV0: ${isOperationV0}`,
        );

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_VALIDATE_ASSET_REMOTE_START,
            operationId,
            blockchain,
        );

        this.logger.debug(
            `[store-request-debug] Fetching cached operation data. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
        );

        const cachedData = await this.operationIdService.getCachedOperationIdData(operationId);

        // Detailed logging of cached data
        const hasCachedData = cachedData !== undefined && cachedData !== null;
        const cachedDataKeys = hasCachedData ? Object.keys(cachedData) : [];

        this.logger.debug(
            `[store-request-debug] Cached data retrieved. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, hasCachedData: ${hasCachedData}, cachedDataKeys: [${cachedDataKeys.join(
                ', ',
            )}]`,
        );

        if (!hasCachedData) {
            this.logger.error(
                `[store-request-debug] NO CACHED DATA FOUND! OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}. This is likely the source of the problem.`,
            );
        }

        const { dataset } = cachedData || {};

        // Detailed dataset logging
        const hasDataset = dataset !== undefined;
        const isDatasetNull = dataset === null;
        const datasetType = typeof dataset;
        const datasetSize = hasDataset && !isDatasetNull ? JSON.stringify(dataset).length : 0;
        const isDatasetArray = Array.isArray(dataset);
        const datasetLength = isDatasetArray ? dataset.length : 'N/A';

        this.logger.debug(
            `[store-request-debug] Dataset extracted. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, hasDataset: ${hasDataset}, isNull: ${isDatasetNull}, type: ${datasetType}, isArray: ${isDatasetArray}, length: ${datasetLength}, size: ${datasetSize} bytes`,
        );

        if (isDatasetNull) {
            this.logger.error(
                `[store-request-debug] DATASET IS NULL! OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}. Full cachedData keys: [${cachedDataKeys.join(
                    ', ',
                )}]`,
            );
        }

        if (!hasDataset) {
            this.logger.error(
                `[store-request-debug] DATASET IS UNDEFINED! OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}. Full cachedData: ${JSON.stringify(
                    cachedData,
                )?.substring(0, 500)}`,
            );
        }

        this.logger.debug(
            `[store-request-debug] Starting validation. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
        );

        const validationResult = await this.validateReceivedData(
            operationId,
            datasetRoot,
            dataset,
            blockchain,
            isOperationV0,
        );

        this.logger.debug(
            `[store-request-debug] Validation complete. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, result messageType: ${validationResult.messageType}`,
        );

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_VALIDATE_ASSET_REMOTE_END,
            operationId,
            blockchain,
        );

        if (validationResult.messageType === NETWORK_MESSAGE_TYPES.RESPONSES.NACK) {
            this.logger.warn(
                `[store-request-debug] Validation failed, returning NACK. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, error: ${validationResult.messageData?.errorMessage}`,
            );
            return validationResult;
        }

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_LOCAL_STORE_REMOTE_CACHE_DATASET_START,
            operationId,
            blockchain,
        );

        this.logger.debug(
            `[store-request-debug] Starting dataset caching. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, isOperationV0: ${isOperationV0}`,
        );

        if (isOperationV0) {
            this.logger.debug(
                `[store-request-debug] Creating V6 knowledge collection. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
            );
            await this.tripleStoreService.createV6KnowledgeCollection(dataset, ual);
        } else {
            this.logger.debug(
                `[store-request-debug] Caching dataset to pending storage. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, datasetSize: ${datasetSize} bytes`,
            );
            await this.pendingStorageService.cacheDataset(
                operationId,
                datasetRoot,
                dataset,
                remotePeerId,
            );
        }

        this.logger.debug(
            `[store-request-debug] Dataset caching complete. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
        );

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_LOCAL_STORE_REMOTE_CACHE_DATASET_END,
            operationId,
            blockchain,
        );

        const identityId = await this.blockchainModuleManager.getIdentityId(blockchain);

        const { v, r, s, vs } = await this.signatureService.signMessage(blockchain, datasetRoot);

        this.logger.debug(
            `[store-request-debug] Signed message, returning ACK. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, identityId: ${identityId}`,
        );

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_VALIDATE_ASSET_REMOTE_END,
            operationId,
            blockchain,
        );

        return {
            messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
            messageData: { identityId, v, r, s, vs },
        };
    }

    /**
     * Builds default handleStoreRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0HandleStoreRequestCommand',
            priority: COMMAND_PRIORITY.HIGHEST,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleStoreRequestCommand;
