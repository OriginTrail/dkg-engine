import { NETWORK_MESSAGE_TYPES } from '../../constants/constants.js';
import BaseController from './base-rpc-controller.js';

class BatchGetRpcController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.operationService = ctx.batchGetService;
    }

    async v1_0_0HandleRequest(message, remotePeerId, protocol) {
        const { operationId, messageType } = message.header;
        const handleRequestCommand = 'v1_0_0HandleBatchGetRequestCommand';
        let commandName;
        switch (messageType) {
            case NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST:
                commandName = handleRequestCommand;
                break;
            default:
                throw Error('unknown messageType');
        }

        await this.commandExecutor.add({
            name: commandName,
            sequence: [],
            delay: 0,
            data: {
                remotePeerId,
                operationId,
                protocol,
                uals: message.data.uals,
                blockchain: message.data.blockchain,
                tokenIds: message.data.tokenIds,
                includeMetadata: message.data.includeMetadata,
            },
            transactional: false,
        });
    }
}

export default BatchGetRpcController;
