import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    OPERATION_REQUEST_STATUS,
    NETWORK_MESSAGE_TYPES,
    NETWORK_SIGNATURES_FOLDER,
    PUBLISHER_NODE_SIGNATURES_FOLDER,
    NETWORK_MESSAGE_TIMEOUT_MILLS,
} from '../../../../constants/constants.js';
import Command from '../../../command.js';

class PublishReplicationCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.operationIdService = ctx.operationIdService;
        this.operationService = ctx.publishService;
        this.shardingTableService = ctx.shardingTableService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.signatureService = ctx.signatureService;
        this.cryptoService = ctx.cryptoService;
        this.messagingService = ctx.messagingService;

        this.errorType = ERROR_TYPE.LOCAL_STORE.LOCAL_STORE_ERROR;
    }

    async execute(command) {
        const { operationId, blockchain, datasetRoot, minimumNumberOfNodeReplications, batchSize } =
            command.data;
        this.logger.debug(
            `Searching for shard for operationId: ${operationId}, dataset root: ${datasetRoot}`,
        );
        try {
            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.FIND_NODES_START,
            );

            const minAckResponses = this.operationService.getMinAckResponses(
                minimumNumberOfNodeReplications,
            );

            const networkProtocols = this.operationService.getNetworkProtocols();

            const shardNodes = [];
            let nodePartOfShard = false;
            const currentPeerId = this.networkModuleManager.getPeerId().toB58String();

            const foundNodes = await this.findShardNodes(blockchain);

            for (const node of foundNodes) {
                if (node.id === currentPeerId) {
                    nodePartOfShard = true;
                } else {
                    shardNodes.push({ id: node.id, protocol: networkProtocols[0] });
                }
            }

            this.logger.debug(
                `Found ${
                    shardNodes.length + (nodePartOfShard ? 1 : 0)
                } node(s) for operationId: ${operationId}`,
            );

            this.logger.trace(
                `Found shard: ${JSON.stringify(
                    shardNodes.map((node) => node.id),
                    null,
                    2,
                )}`,
            );

            if (shardNodes.length + (nodePartOfShard ? 1 : 0) < minAckResponses) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Unable to find enough nodes for operationId: ${operationId}. Minimum number of nodes required: ${minAckResponses}`,
                    this.errorType,
                    true,
                );

                this.operationIdService.emitChangeEvent(
                    OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_FAILED,
                    operationId,
                );
                return Command.empty();
            }

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.PUBLISH.PUBLISH_FIND_NODES_END,
            );

            try {
                await this.operationIdService.updateOperationIdStatus(
                    operationId,
                    blockchain,
                    OPERATION_ID_STATUS.LOCAL_STORE.LOCAL_STORE_START,
                );
                const batchSizePar = this.operationService.getBatchSize(batchSize);

                const { identityId, v, r, s, vs } = await this.createSignatures(
                    blockchain,
                    nodePartOfShard,
                    datasetRoot,
                    operationId,
                );

                const updatedData = {
                    ...command.data,
                    batchSize: batchSizePar,
                    minAckResponses,
                    numberOfFoundNodes: shardNodes.length + (nodePartOfShard ? 1 : 0),
                };
                // eslint-disable-next-line no-param-reassign
                command.data = updatedData;
                if (nodePartOfShard) {
                    await this.operationService.processResponse(
                        { ...command, data: updatedData },
                        OPERATION_REQUEST_STATUS.COMPLETED,
                        {
                            messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
                            messageData: { identityId, v, r, s, vs },
                        },
                        null,
                    );
                }

                await this.operationIdService.updateOperationIdStatus(
                    operationId,
                    blockchain,
                    OPERATION_ID_STATUS.LOCAL_STORE.LOCAL_STORE_END,
                );
            } catch (e) {
                await this.handleError(operationId, blockchain, e.message, this.errorType, true);
                this.operationIdService.emitChangeEvent(
                    OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_FAILED,
                    operationId,
                );
                return Command.empty();
            }
            const { dataset } = await this.operationIdService.getCachedOperationIdData(operationId);
            const message = {
                dataset: dataset.public,
                datasetRoot,
                blockchain,
            };

            // Run all message sending operations in parallel
            await Promise.all(
                shardNodes.map((node) =>
                    this.sendAndHandleMessage(node, operationId, message, command),
                ),
            );
        } catch (e) {
            await this.handleError(operationId, blockchain, e.message, this.errorType, true);
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_FAILED,
                operationId,
            );
            return Command.empty();
        }

        return Command.empty();
    }

    async sendAndHandleMessage(node, operationId, message, command) {
        const response = await this.messagingService.sendProtocolMessage(
            node,
            operationId,
            message,
            NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST,
            NETWORK_MESSAGE_TIMEOUT_MILLS.PUBLISH.REQUEST,
        );
        const responseData = response.data;
        if (response.header.messageType === NETWORK_MESSAGE_TYPES.RESPONSES.ACK) {
            // eslint-disable-next-line no-await-in-loop
            await this.signatureService.addSignatureToStorage(
                NETWORK_SIGNATURES_FOLDER,
                operationId,
                responseData.identityId,
                responseData.v,
                responseData.r,
                responseData.s,
                responseData.vs,
            );
            // eslint-disable-next-line no-await-in-loop
            await this.operationService.processResponse(
                command,
                OPERATION_REQUEST_STATUS.COMPLETED,
                responseData,
            );
        } else {
            // eslint-disable-next-line no-await-in-loop
            await this.operationService.processResponse(
                command,
                OPERATION_REQUEST_STATUS.FAILED,
                responseData,
            );
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_FAILED,
                operationId,
            );
        }
    }

    async findShardNodes(blockchainId) {
        const shardNodes = await this.shardingTableService.findShard(
            blockchainId,
            true, // filter inactive nodes
        );

        // TODO: Optimize this so it's returned by shardingTableService.findShard
        const nodesFound = await Promise.all(
            shardNodes.map(({ peerId }) =>
                this.shardingTableService.findPeerAddressAndProtocols(peerId),
            ),
        );

        return nodesFound;
    }

    async createSignatures(blockchain, nodePartOfShard, datasetRoot, operationId) {
        let v;
        let r;
        let s;
        let vs;
        const identityId = await this.blockchainModuleManager.getIdentityId(blockchain);
        if (nodePartOfShard) {
            ({ v, r, s, vs } = await this.signatureService.signMessage(blockchain, datasetRoot));
            await this.signatureService.addSignatureToStorage(
                NETWORK_SIGNATURES_FOLDER,
                operationId,
                identityId,
                v,
                r,
                s,
                vs,
            );
        }

        const {
            v: publisherNodeV,
            r: publisherNodeR,
            s: publisherNodeS,
            vs: publisherNodeVS,
        } = await this.signatureService.signMessage(
            blockchain,
            this.cryptoService.keccak256EncodePacked(
                ['uint72', 'bytes32'],
                [identityId, datasetRoot],
            ),
        );
        await this.signatureService.addSignatureToStorage(
            PUBLISHER_NODE_SIGNATURES_FOLDER,
            operationId,
            identityId,
            publisherNodeV,
            publisherNodeR,
            publisherNodeS,
            publisherNodeVS,
        );
        return { identityId, v, r, s, vs };
    }

    /**
     * Builds default localStoreCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'publishReplicationCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishReplicationCommand;
