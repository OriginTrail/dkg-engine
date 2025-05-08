import fs from 'fs/promises';
import path from 'path';
import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';
import {
    ERROR_TYPE,
    NETWORK_MESSAGE_TYPES,
    OPERATION_ID_STATUS,
    MIGRATION_FLAG_PATH,
} from '../../../../../constants/constants.js';

class HandleBatchGetRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.getService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.paranetService = ctx.paranetService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.networkModuleManager = ctx.networkModuleManager;
        this.cryptoService = ctx.cryptoService;

        this.errorType = ERROR_TYPE.GET.GET_REQUEST_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.GET.GET_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.GET.GET_REMOTE_END;
    }

    async prepareMessage(commandData) {
        const {
            operationId,
            blockchain,
            tokenIds,
            uals,
            // paranetUAL,
            // remotePeerId,
            // repository,
            // contentType,
        } = commandData;

        // if (paranetUAL) {
        //     const {
        //         contract: paranetContract,
        //         knowledgeCollectionId: paranetKnowledgeCollectionId,
        //         knowledgeAssetId: paranetKnowledgeAssetId,
        //     } = this.ualService.resolveUAL(paranetUAL);
        //     const paranetId = this.paranetService.constructParanetId(
        //         paranetContract,
        //         paranetKnowledgeCollectionId,
        //         paranetKnowledgeAssetId,
        //     );
        //     const paranetNodeAccessPolicy = await this.blockchainModuleManager.getNodesAccessPolicy(
        //         blockchain,
        //         paranetId,
        //     );
        //     if (paranetNodeAccessPolicy === PARANET_ACCESS_POLICY.PERMISSIONED) {
        //         const knowledgeCollectionOnchainId = this.cryptoService.keccak256EncodePacked(
        //             ['address', 'uint256'],
        //             [contract, knowledgeCollectionId],
        //         );
        //         const [isKCInParanet, paranetPermissionedNodes] = await Promise.all([
        //             this.blockchainModuleManager.isKnowledgeCollectionRegistered(
        //                 blockchain,
        //                 paranetId,
        //                 knowledgeCollectionOnchainId,
        //             ),
        //             this.blockchainModuleManager.getPermissionedNodes(blockchain, paranetId),
        //         ]);

        //         if (!isKCInParanet) {
        //             return {
        //                 messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
        //                 messageData: {
        //                     errorMessage: `Knowledge collection ${knowledgeCollectionId} is not registered in the Paranet (${paranetId}) with UAL: ${paranetUAL}`,
        //                 },
        //             };
        //         }
        //         const paranetPermissionedPeerIds = paranetPermissionedNodes.map((node) =>
        //             this.cryptoService.convertHexToAscii(node.nodeId),
        //         );

        //         if (!paranetPermissionedPeerIds.includes(remotePeerId)) {
        //             return {
        //                 messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
        //                 messageData: {
        //                     errorMessage: `Remote peer ${remotePeerId} is not a part of the Paranet (${paranetId}) with UAL: ${paranetUAL}`,
        //                 },
        //             };
        //         }

        //         const currentPeerId = this.networkModuleManager.getPeerId().toB58String();
        //         if (!paranetPermissionedPeerIds.includes(currentPeerId)) {
        //             return {
        //                 messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
        //                 messageData: {
        //                     errorMessage: `This node is not a part of the Paranet (${paranetId}) with UAL: ${paranetUAL}`,
        //                 },
        //             };
        //         }
        //         const promises = [];
        //         promises.push(
        //             this.tripleStoreService.getAssertion(
        //                 blockchain,
        //                 contract,
        //                 knowledgeCollectionId,
        //                 knowledgeAssetId,
        //                 tokenIds,
        //                 migrationFlag,
        //                 TRIPLES_VISIBILITY.ALL,
        //                 repository,
        //             ),
        //         );

        //         if (includeMetadata) {
        //             const metadataPromise = this.tripleStoreService.getAssertionMetadata(
        //                 blockchain,
        //                 contract,
        //                 knowledgeCollectionId,
        //                 knowledgeAssetId,
        //             );
        //             promises.push(metadataPromise);
        //         }

        //         const [assertion, metadata] = await Promise.all(promises);

        //         if (assertion?.public?.length) {
        //             return {
        //                 messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
        //                 messageData: { assertion, metadata },
        //             };
        //         }

        //         return {
        //             messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
        //             messageData: {
        //                 errorMessage: `Unable to find assertion ${ual} for Paranet (${paranetId}) with UAL: ${paranetUAL}`,
        //             },
        //         };
        //     }
        // }

        const promises = [];

        let migrationFlag = '0';
        const migrationFlagPath = path.join(process.cwd(), MIGRATION_FLAG_PATH);
        try {
            migrationFlag = await fs.readFile(migrationFlagPath, 'utf8');
            migrationFlag = migrationFlag.trim();
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn(
                    `Migration flag file not found at ${migrationFlagPath}, using default value '${migrationFlag}'`,
                );
            } else {
                throw error;
            }
        }

        const assertionPromise = this.tripleStoreService.getAssertionsInBatch(
            uals,
            tokenIds,
            migrationFlag,
            'public',
        );

        promises.push(assertionPromise);

        // if (includeMetadata) {
        //     const metadataPromise = this.tripleStoreService.getAssertionMetadata(
        //         blockchain,
        //         contract,
        //         knowledgeCollectionId,
        //         knowledgeAssetId,
        //     );
        //     promises.push(metadataPromise);
        // }

        const [assertions /* metadata */] = await Promise.all(promises);

        const responseData = {
            assertions,
            // ...(includeMetadata && metadata && { metadata }),
        };

        if (assertions?.length) {
            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.GET.GET_REMOTE_END,
            );
        }

        return { messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK, messageData: responseData };
    }

    /**
     * Builds default handleGetRequestCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0HandleBatchGetRequestCommand',
            delay: 0,
            transactional: false,
            errorType: ERROR_TYPE.BATCH_GET.BATCH_GET_REQUEST_REMOTE_ERROR,
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleBatchGetRequestCommand;
