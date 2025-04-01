import { DEFAULT_GET_STATE, NETWORK_MESSAGE_TYPES } from '../../constants/constants.js';
import BaseController from './base-rpc-controller.js';

class GetController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.operationService = ctx.getService;
    }

    async v1_0_0HandleRequest(message, remotePeerId, protocol) {
        const { operationId, messageType } = message.header;
        const [handleRequestCommand] = this.getCommandSequence(protocol);
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
                ual: message.data.ual,
                blockchain: message.data.blockchain,
                contract: message.data.contract,
                knowledgeCollectionId: message.data.knowledgeCollectionId,
                knowledgeAssetId: message.data.knowledgeAssetId,
                includeMetadata: message.data.includeMetadata,
                state: message.data.state ?? DEFAULT_GET_STATE,
                paranetUAL: message.data.paranetUAL,
                paranetId: message.data.paranetId,
            },
            transactional: false,
        });
    }
}

export default GetController;
