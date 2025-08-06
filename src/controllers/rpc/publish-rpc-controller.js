import BaseController from './base-rpc-controller.js';
import { NETWORK_MESSAGE_TYPES, COMMAND_PRIORITY } from '../../constants/constants.js';

class PublishController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.publishService;
        this.commandExecutor = ctx.commandExecutor;
        this.operationIdService = ctx.operationIdService;
    }

    async v1_0_0HandleRequest(message, remotePeerId, protocol) {
        const { operationId, messageType } = message.header;

        const command = { sequence: [], transactional: false, data: {} };
        const [handleRequestCommand] = this.getCommandSequence(protocol);
        if (messageType === NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST) {
            Object.assign(command, {
                name: handleRequestCommand,
                priority: COMMAND_PRIORITY.HIGHEST,
            });

            await this.operationIdService.cacheOperationIdDataToMemory(operationId, {
                dataset: message.data.dataset,
                datasetRoot: message.data.datasetRoot,
            });

            await this.operationIdService.cacheOperationIdDataToFile(operationId, {
                dataset: message.data.dataset,
                datasetRoot: message.data.datasetRoot,
            });
        } else {
            throw new Error('Unknown message type');
        }

        command.data = {
            ...command.data,
            remotePeerId,
            operationId,
            protocol,
            dataset: message.data.dataset,
            datasetRoot: message.data.datasetRoot,
            blockchain: message.data.blockchain,
            isOperationV0: message.data.isOperationV0,
            contract: message.data.contract,
            tokenId: message.data.tokenId,
        };

        await this.commandExecutor.add(command);
    }
}

export default PublishController;
