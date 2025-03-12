import ProtocolRequestCommand from '../../../common/protocol-request-command.js';
import {
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    ERROR_TYPE,
    NETWORK_SIGNATURES_FOLDER,
} from '../../../../../constants/constants.js';

class PublishRequestCommand extends ProtocolRequestCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.publishService;
        this.signatureService = ctx.signatureService;
        this.operationIdService = ctx.operationIdService;
        this.errorType = ERROR_TYPE.PUBLISH.PUBLISH_STORE_REQUEST_ERROR;
    }

    async prepareMessage(command) {
        const { datasetRoot, operationId, isOperationV0, contract, tokenId } = command.data;

        // TODO: Backwards compatibility, send blockchain without chainId
        const { blockchain } = command.data;

        const { dataset } = await this.operationIdService.getCachedOperationIdData(operationId);

        return {
            dataset: isOperationV0 ? dataset : dataset.public,
            datasetRoot,
            blockchain,
            isOperationV0,
            contract,
            tokenId,
        };
    }

    getNextCommandData(command) {
        const { datasetRoot, blockchain, isOperationV0, contract, tokenId } = command.data;
        return {
            blockchain,
            datasetRoot,
            isOperationV0,
            contract,
            tokenId,
        };
    }

    messageTimeout() {
        return NETWORK_MESSAGE_TIMEOUT_MILLS.PUBLISH.REQUEST;
    }

    async handleAck(command, responseData) {
        const { operationId } = command.data;

        await this.signatureService.addSignatureToStorage(
            NETWORK_SIGNATURES_FOLDER,
            operationId,
            responseData.identityId,
            responseData.v,
            responseData.r,
            responseData.s,
            responseData.vs,
        );

        return super.handleAck(command, responseData);
    }

    /**
     * Builds default publishRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0PublishRequestCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishRequestCommand;
