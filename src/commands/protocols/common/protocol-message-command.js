import Command from '../../command.js';
import { NETWORK_MESSAGE_TYPES, OPERATION_REQUEST_STATUS } from '../../../constants/constants.js';

class ProtocolMessageCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.networkModuleManager = ctx.networkModuleManager;
    }

    async executeProtocolMessageCommand(command, messageType) {
        if (!(await this.shouldSendMessage(command))) {
            return Command.empty();
        }

        const message = await this.prepareMessage(command);

        return this.sendProtocolMessage(command, message, messageType);
    }

    async shouldSendMessage() {
        return true;
    }

    async prepareMessage() {
        throw Error('prepareMessage not implemented');
    }

    async sendProtocolMessage(command, message, messageType) {
        const { node, operationId } = command.data;

        const response = await this.networkModuleManager.sendMessage(
            node.protocol,
            node.id,
            messageType,
            operationId,
            message,
            this.messageTimeout(),
        );

        this.networkModuleManager.removeCachedSession(operationId, node.id);

        switch (response.header.messageType) {
            case NETWORK_MESSAGE_TYPES.RESPONSES.BUSY:
                return this.handleBusy(command, response.data);
            case NETWORK_MESSAGE_TYPES.RESPONSES.NACK:
                return this.handleNack(command, response.data);
            case NETWORK_MESSAGE_TYPES.RESPONSES.ACK:
                return this.handleAck(command, response.data);
            default:
                await this.markResponseAsFailed(
                    command,
                    `Received unknown message type from node during ${command.name}`,
                );
                return Command.empty();
        }
    }

    messageTimeout() {
        throw Error('messageTimeout not implemented');
    }

    async handleAck(command) {
        return this.continueSequence(command.data, command.sequence);
    }

    async handleBusy() {
        return Command.retry();
    }

    async handleNack(command, responseData) {
        await this.markResponseAsFailed(
            command,
            `Received NACK response from node during ${command.name}. Error message: ${responseData.errorMessage}`,
        );
        return Command.empty();
    }

    async recover(command) {
        const { node, operationId } = command.data;
        this.networkModuleManager.removeCachedSession(operationId, node.id);

        await this.markResponseAsFailed(command, command.message);
        return Command.empty();
    }

    async markResponseAsFailed(command, errorMessage) {
        await this.operationService.processResponse(command, OPERATION_REQUEST_STATUS.FAILED, {
            errorMessage,
        });
    }

    async retryFinished(command) {
        await this.markResponseAsFailed(
            command,
            `Max number of retries for protocol message ${command.name} reached`,
        );
    }
}

export default ProtocolMessageCommand;
