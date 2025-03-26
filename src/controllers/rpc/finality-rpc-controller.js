import { NETWORK_MESSAGE_TYPES } from '../../constants/constants.js';
import BaseController from './base-rpc-controller.js';

class FinalityController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.operationService = ctx.finalityService;
    }

    async v1_0_0HandleRequest(message, remotePeerId, protocol) {
        const { operationId, messageType } = message.header;
        const handleRequestCommands = this.getCommandSequence(protocol);
        let commandName;
        switch (messageType) {
            case NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST:
                [commandName] = handleRequestCommands;
                break;
            default:
                throw Error('unknown messageType');
        }

        await this.commandExecutor.add({
            name: commandName,
            sequence: [...handleRequestCommands.slice(1)],
            delay: 0,
            data: {
                remotePeerId,
                operationId,
                protocol,
                ual: message.data.ual,
                blockchain: message.data.blockchain,
                publishOperationId: message.data.publishOperationId,
            },
            transactional: false,
        });
    }

    getCommandSequence(protocol) {
        // TODO: Rework this to schedule different command for update
        return [...this.protocolService.getReceiverCommandSequence(protocol)];
    }
}

export default FinalityController;
