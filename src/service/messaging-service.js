import { NETWORK_MESSAGE_TYPES, OPERATION_REQUEST_STATUS } from '../constants/constants.js';

class MessagingService {
    constructor(ctx) {
        this.networkModuleManager = ctx.networkModuleManager;
    }

    async sendProtocolMessage(node, operationId, message, messageType, timeout) {
        const response = await this.networkModuleManager.sendMessage(
            node.protocol,
            node.id,
            messageType,
            operationId,
            message,
            timeout,
        );

        this.networkModuleManager.removeCachedSession(operationId, node.id);
        return response;
    }

    async handleProtocolResponse(response, operationService, blockchain, operationId) {
        switch (response.header.messageType) {
            case NETWORK_MESSAGE_TYPES.RESPONSES.BUSY:
                return this.handleBusyResponse();
            case NETWORK_MESSAGE_TYPES.RESPONSES.NACK:
                return this.handleNackResponse(
                    operationService,
                    blockchain,
                    operationId,
                    response.data,
                );
            case NETWORK_MESSAGE_TYPES.RESPONSES.ACK:
                return this.handleAckResponse(
                    operationService,
                    blockchain,
                    operationId,
                    response.data,
                );
            default:
                return this.handleUnknownResponse(operationService, blockchain, operationId);
        }
    }

    async handleBusyResponse() {
        return { retry: true };
    }

    async handleAckResponse(operationService, blockchain, operationId, responseData) {
        await operationService.processResponse(
            operationId,
            blockchain,
            OPERATION_REQUEST_STATUS.COMPLETED,
            responseData,
        );
        return { success: true };
    }

    async handleNackResponse(operationService, blockchain, operationId, responseData) {
        await operationService.processResponse(
            operationId,
            blockchain,
            OPERATION_REQUEST_STATUS.FAILED,
            {
                errorMessage: `Received NACK response. Error: ${responseData.errorMessage}`,
            },
        );
        return { failed: true };
    }

    async handleUnknownResponse(operationService, blockchain, operationId) {
        await operationService.processResponse(
            operationId,
            blockchain,
            OPERATION_REQUEST_STATUS.FAILED,
            {
                errorMessage: `Received unknown message type during`, // TODO: Add command name
            },
        );
        return { failed: true };
    }
}

export default MessagingService;
