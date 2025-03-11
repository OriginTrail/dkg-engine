import Command from '../../../../command.js';
import ProtocolRequestCommand from '../../../common/protocol-request-command.js';
import {
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    ERROR_TYPE,
    OPERATION_ID_STATUS,
    COMMAND_PRIORITY,
} from '../../../../../constants/constants.js';

class FinalityRequestCommand extends ProtocolRequestCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.finalityService;
        this.operationIdService = ctx.operationIdService;

        this.errorType = ERROR_TYPE.FINALITY.FINALITY_REQUEST_ERROR;
    }

    async prepareMessage(command) {
        const { ual, publishOperationId, blockchain, operationId } = command.data;

        return { ual, publishOperationId, blockchain, operationId };
    }

    async handleAck(command) {
        const { operationId, blockchain } = command.data;
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.COMPLETED,
        );
        return ProtocolRequestCommand.empty();
    }

    async handleNack(command, responseData) {
        const { operationId, blockchain } = command.data;
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.COMPLETED,
        );
        await this.markResponseAsFailed(
            command,
            `Received NACK response from node during ${command.name}. Error message: ${responseData.errorMessage}`,
        );
        return Command.empty();
    }

    messageTimeout() {
        return NETWORK_MESSAGE_TIMEOUT_MILLS.FINALITY.REQUEST;
    }

    /**
     * Builds default finalityRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0FinalityRequestCommand',
            delay: 0,
            retries: 0,
            transactional: false,
            priority: COMMAND_PRIORITY.HIGHEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default FinalityRequestCommand;
