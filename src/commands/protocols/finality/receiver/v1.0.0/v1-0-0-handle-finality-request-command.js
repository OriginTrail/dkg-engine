import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';
import {
    ERROR_TYPE,
    OPERATION_ID_STATUS,
    COMMAND_PRIORITY,
    NETWORK_MESSAGE_TYPES,
} from '../../../../../constants/constants.js';

class HandleFinalityRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.finalityService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.paranetService = ctx.paranetService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.commandExecutor = ctx.commandExecutor;
        this.protocolService = ctx.protocolService;
        this.operationService = ctx.finalityService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;

        this.errorType = ERROR_TYPE.FINALITY.FINALITY_REQUEST_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.FINALITY.FINALITY_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.FINALITY.FINALITY_REMOTE_END;
    }

    async prepareMessage(commandData) {
        return commandData.response;
    }

    async execute(command) {
        const { ual, publishOperationId, blockchain, operationId, remotePeerId, state } =
            command.data;

        let ualWithState = ual;
        if (state) {
            ualWithState = `${ual}:${state}`;
        }

        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.FINALITY.PUBLISH_FINALITY_REMOTE_START,
            operationId,
            blockchain,
        );

        let response;
        let success;
        try {
            await this.repositoryModuleManager.saveFinalityAck(
                publishOperationId,
                ualWithState,
                remotePeerId,
            );

            success = true;
            response = {
                messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
                messageData: { message: `Acknowledged storing of ${ualWithState}.` },
            };
        } catch (err) {
            success = false;
            response = {
                messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                messageData: { errorMessage: `Failed to acknowledge storing of ${ualWithState}.` },
            };
        }

        await this.operationService.markOperationAsCompleted(operationId, blockchain, success, [
            OPERATION_ID_STATUS.FINALITY.PUBLISH_FINALITY_FETCH_FROM_NODES_END,
            OPERATION_ID_STATUS.FINALITY.PUBLISH_FINALITY_END,
            OPERATION_ID_STATUS.COMPLETED,
        ]);
        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.FINALITY.PUBLISH_FINALITY_REMOTE_END,
            operationId,
            blockchain,
        );

        // eslint-disable-next-line no-param-reassign
        command.data.response = response;
        super.execute(command);

        return HandleFinalityRequestCommand.empty();
    }

    /**
     * Builds default handleFinalityRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0HandleFinalityRequestCommand',
            delay: 0,
            transactional: false,
            errorType: ERROR_TYPE.FINALITY.FINALITY_REQUEST_REMOTE_ERROR,
            priority: COMMAND_PRIORITY.HIGHEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleFinalityRequestCommand;
