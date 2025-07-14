import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';
import {
    ERROR_TYPE,
    NETWORK_MESSAGE_TYPES,
    OPERATION_ID_STATUS,
} from '../../../../../constants/constants.js';

class HandleAskRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.askService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.paranetService = ctx.paranetService;

        this.errorType = ERROR_TYPE.ASK.ASK_REQUEST_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.ASK.ASK_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.ASK.ASK_REMOTE_END;
    }

    async prepareMessage(commandData) {
        const { ual, operationId, blockchain } = commandData;
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.ASK.ASK_REMOTE_START,
        );

        const knowledgeCollectionExistsInUnifiedGraph =
            await this.tripleStoreService.checkIfKnowledgeCollectionExistsInUnifiedGraph(ual);
        if (knowledgeCollectionExistsInUnifiedGraph) {
            await this.operationService.markOperationAsCompleted(
                operationId,
                blockchain,
                knowledgeCollectionExistsInUnifiedGraph,
                [
                    OPERATION_ID_STATUS.ASK.ASK_FETCH_FROM_NODES_END,
                    OPERATION_ID_STATUS.ASK.ASK_END,
                    OPERATION_ID_STATUS.COMPLETED,
                ],
            );
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.ASK.ASK_REMOTE_END,
        );

        return knowledgeCollectionExistsInUnifiedGraph
            ? {
                  messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
                  messageData: { knowledgeCollectionExistsInUnifiedGraph },
              }
            : {
                  messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                  messageData: { errorMessage: `Unable to find knowledge collection ${ual}` },
              };
    }

    /**
     * Builds default handleAskRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0HandleAskRequestCommand',
            transactional: false,
            errorType: ERROR_TYPE.ASK.ASK_REQUEST_REMOTE_ERROR,
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleAskRequestCommand;
