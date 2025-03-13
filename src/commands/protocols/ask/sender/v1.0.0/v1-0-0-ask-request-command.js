import ProtocolRequestCommand from '../../../common/protocol-request-command.js';
import {
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    ERROR_TYPE,
    OPERATION_REQUEST_STATUS,
    OPERATION_STATUS,
} from '../../../../../constants/constants.js';

class AskRequestCommand extends ProtocolRequestCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.askService;
        this.operationIdService = ctx.operationIdService;

        this.errorType = ERROR_TYPE.ASK.ASK_REQUEST_ERROR;
    }

    async shouldSendMessage(command) {
        const { operationId } = command.data;

        const { status } = await this.operationService.getOperationStatus(operationId);

        if (status === OPERATION_STATUS.IN_PROGRESS) {
            return true;
        }
        this.logger.trace(
            `${command.name} skipped for operationId: ${operationId} with status ${status}`,
        );

        return false;
    }

    async prepareMessage(command) {
        const { ual, operationId, numberOfFoundNodes, blockchain } = command.data;

        return {
            ual,
            operationId,
            numberOfFoundNodes,
            blockchain,
        };
    }

    messageTimeout() {
        return NETWORK_MESSAGE_TIMEOUT_MILLS.ASK.REQUEST;
    }

    async handleAck(command, responseData) {
        if (responseData?.knowledgeCollectionExistsInUnifiedGraph) {
            await this.operationService.processResponse(
                command,
                OPERATION_REQUEST_STATUS.COMPLETED,
                responseData,
            );

            return ProtocolRequestCommand.empty();
        }

        return this.handleNack(command, responseData);
    }

    /**
     * Builds default askRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0AskRequestCommand',
            delay: 0,
            retries: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default AskRequestCommand;
