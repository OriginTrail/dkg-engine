import Command from '../../command.js';
import ProtocolMessageCommand from './protocol-message-command.js';
import { NETWORK_MESSAGE_TYPES, OPERATION_REQUEST_STATUS } from '../../../constants/constants.js';

class ProtocolRequestCommand extends ProtocolMessageCommand {
    async execute(command) {
        const result = await this.executeProtocolMessageCommand(
            command,
            NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST,
        );

        return result;
    }

    async handleAck(command, responseData) {
        await this.operationService.processResponse(
            command,
            OPERATION_REQUEST_STATUS.COMPLETED,
            responseData,
        );
        return Command.empty();
    }
}

export default ProtocolRequestCommand;
