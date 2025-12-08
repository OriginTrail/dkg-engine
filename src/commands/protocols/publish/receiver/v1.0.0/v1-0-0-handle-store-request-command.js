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
        const { blockchain, operationId, datasetRoot, remotePeerId, isOperationV0 } = commandData;

        this.logger.debug(
            `Handling store request from peer: ${remotePeerId}, ` +
                `operationId: ${operationId}, datasetRoot: ${datasetRoot}`,
        );

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_VALIDATE_ASSET_REMOTE_START,
            operationId,
            blockchain,
        );

        const { dataset } = await this.operationIdService.getCachedOperationIdData(operationId);

        const validationResult = await this.validateReceivedData(
            operationId,
            datasetRoot,
            dataset,
            blockchain,
            isOperationV0,
        );

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_VALIDATE_ASSET_REMOTE_END,
            operationId,
            blockchain,
        );

        if (validationResult.messageType === NETWORK_MESSAGE_TYPES.RESPONSES.NACK) {
            this.logger.debug(
                `Validation failed for store request, operationId: ${operationId}, ` +
                    `datasetRoot: ${datasetRoot}`,
            );
            return validationResult;
        }

        this.logger.trace(`Validation passed for operationId: ${operationId}`);

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_LOCAL_STORE_REMOTE_CACHE_DATASET_START,
            operationId,
            blockchain,
        );
        if (isOperationV0) {
            const { contract, tokenId } = commandData;
            const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);
            this.logger.debug(`Creating V6 knowledge collection for UAL: ${ual}`);
            await this.tripleStoreService.createV6KnowledgeCollection(dataset, ual);
        } else {
            this.logger.debug(
                `Caching dataset for operationId: ${operationId}, datasetRoot: ${datasetRoot}`,
            );
            await this.pendingStorageService.cacheDataset(
                operationId,
                datasetRoot,
                dataset,
                remotePeerId,
            );
        }
        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_LOCAL_STORE_REMOTE_CACHE_DATASET_END,
            operationId,
            blockchain,
        );

        const identityId = await this.blockchainModuleManager.getIdentityId(blockchain);

        const { v, r, s, vs } = await this.signatureService.signMessage(blockchain, datasetRoot);

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH.PUBLISH_VALIDATE_ASSET_REMOTE_END,
            operationId,
            blockchain,
        );

        this.logger.info(
            `Store request handled successfully for operationId: ${operationId}, ` +
                `datasetRoot: ${datasetRoot}, peer: ${remotePeerId}`,
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
