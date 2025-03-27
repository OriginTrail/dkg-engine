import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';
import {
    ERROR_TYPE,
    NETWORK_MESSAGE_TYPES,
    OPERATION_ID_STATUS,
    TRIPLES_VISIBILITY,
    PARANET_ACCESS_POLICY,
} from '../../../../../constants/constants.js';

class HandleGetRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.getService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.paranetService = ctx.paranetService;

        this.errorType = ERROR_TYPE.GET.GET_REQUEST_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.GET.GET_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.GET.GET_REMOTE_END;
    }

    async prepareMessage(commandData) {
        const {
            operationId,
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            ual,
            includeMetadata,
            paranetId,
            paranetUAL,
            remotePeerId,
        } = commandData;

        if (paranetUAL) {
            const paranetNodeAccessPolicy = await this.blockchainModuleManager.getNodesAccessPolicy(
                blockchain,
                paranetId,
            );
            if (paranetNodeAccessPolicy === PARANET_ACCESS_POLICY.CURATED) {
                const paranetCuratedNodes =
                    await this.blockchainModuleManager.getParanetCuratedNodes(
                        blockchain,
                        paranetId,
                    );
                const paranetCuratedPeerIds = paranetCuratedNodes.map((node) =>
                    this.blockchainModuleManager.convertHexToAscii(blockchain, node.nodeId),
                );

                if (!paranetCuratedPeerIds.includes(remotePeerId)) {
                    return {
                        messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                        messageData: {
                            errorMessage: `Remote peer ${remotePeerId} is not a part of the Paranet (${paranetId}) with UAL: ${paranetUAL}`,
                        },
                    };
                }
                //
                const assertion = await this.tripleStoreService.getAssertion(
                    blockchain,
                    contract,
                    knowledgeCollectionId,
                    knowledgeAssetId,
                    TRIPLES_VISIBILITY.ALL,
                );

                if (assertion?.public?.length) {
                    return {
                        messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
                        messageData: { assertion },
                    };
                }

                return {
                    messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                    messageData: {
                        errorMessage: `Unable to find assertion ${ual} for Paranet ${paranetId} with Paranet UAL: ${paranetUAL}`,
                    },
                };
            }
        }

        const promises = [];

        const assertionPromise = this.tripleStoreService.getAssertion(
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            TRIPLES_VISIBILITY.PUBLIC,
        );

        promises.push(assertionPromise);

        if (includeMetadata) {
            const metadataPromise = this.tripleStoreService.getAssertionMetadata(
                blockchain,
                contract,
                knowledgeCollectionId,
                knowledgeAssetId,
            );
            promises.push(metadataPromise);
        }

        const [assertion, metadata] = await Promise.all(promises);

        const responseData = {
            assertion,
            ...(includeMetadata && metadata && { metadata }),
        };

        if (assertion?.public?.length || assertion?.length) {
            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.GET.GET_REMOTE_END,
            );
        }

        return assertion?.public?.length || assertion?.length
            ? { messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK, messageData: responseData }
            : {
                  messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                  messageData: { errorMessage: `Unable to find assertion ${ual}` },
              };
    }

    /**
     * Builds default handleGetRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0HandleGetRequestCommand',
            delay: 0,
            transactional: false,
            errorType: ERROR_TYPE.GET.GET_REQUEST_REMOTE_ERROR,
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleGetRequestCommand;
