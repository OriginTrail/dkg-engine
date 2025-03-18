import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';

import {
    NETWORK_MESSAGE_TYPES,
    OPERATION_ID_STATUS,
    ERROR_TYPE,
} from '../../../../../constants/constants.js';

class HandleUpdateRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.updateService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.pendingStorageService = ctx.pendingStorageService;
        this.operationIdService = ctx.operationIdService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.signatureService = ctx.signatureService;

        this.errorType = ERROR_TYPE.UPDATE.UPDATE_LOCAL_STORE_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.UPDATE.UPDATE_LOCAL_STORE_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.UPDATE.UPDATE_LOCAL_STORE_REMOTE_END;
    }

    async prepareMessage(commandData) {
        const { blockchain, operationId, datasetRoot } = commandData;

        const { dataset } = await this.operationIdService.getCachedOperationIdData(operationId);

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.UPDATE.UPDATE_VALIDATE_ASSET_REMOTE_START,
        );

        const validationResult = await this.validateReceivedData(
            operationId,
            datasetRoot,
            dataset,
            blockchain,
        );

        this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.UPDATE.UPDATE_VALIDATE_ASSET_REMOTE_END,
        );

        if (validationResult.messageType === NETWORK_MESSAGE_TYPES.RESPONSES.NACK) {
            return validationResult;
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.UPDATE.UPDATE_LOCAL_STORE_REMOTE_CACHE_DATASET_START,
        );
        await this.pendingStorageService.cacheDataset(operationId, datasetRoot, dataset);
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.UPDATE.UPDATE_LOCAL_STORE_REMOTE_CACHE_DATASET_END,
        );

        const identityId = await this.blockchainModuleManager.getIdentityId(blockchain);
        const { v, r, s, vs } = await this.signatureService.signMessage(blockchain, datasetRoot);

        return {
            messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
            messageData: { identityId, v, r, s, vs },
        };
    }

    /**
     * Builds default handleUpdateRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0HandleUpdateRequestCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleUpdateRequestCommand;
