import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';
import { ERROR_TYPE, OPERATION_ID_STATUS } from '../../../../../constants/constants.js';

class HandleFinalityRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.finalityService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.paranetService = ctx.paranetService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;

        this.errorType = ERROR_TYPE.FINALITY.FINALITY_REQUEST_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.FINALITY.FINALITY_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.FINALITY.FINALITY_REMOTE_END;
    }

    async prepareMessage(commandData) {
        return commandData.response;
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
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleFinalityRequestCommand;
