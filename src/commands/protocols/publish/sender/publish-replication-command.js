import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    OPERATION_REQUEST_STATUS,
    NETWORK_MESSAGE_TYPES,
    NETWORK_SIGNATURES_FOLDER,
    PUBLISHER_NODE_SIGNATURES_FOLDER,
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    COMMAND_PRIORITY,
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
                    OPERATION_ID_STATUS.FAILED,
                    operationId,
                    blockchain,
                );
                return Command.empty();
            }

            try {
                await this.operationIdService.updateOperationIdStatus(
                    operationId,
                    blockchain,
                    OPERATION_ID_STATUS.PUBLISH.PUBLISH_REPLICATE_START,
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
            } catch (e) {
                await this.handleError(operationId, blockchain, e.message, this.errorType, true);
                this.operationIdService.emitChangeEvent(
                    OPERATION_ID_STATUS.FAILED,
                    operationId,
                    blockchain,
                );
                return Command.empty();
            }
            const cachedData = await this.operationIdService.getCachedOperationIdData(operationId);

            // Log what we retrieved from cache
            const hasCachedData = cachedData !== undefined && cachedData !== null;
            const hasDataset = cachedData?.dataset !== undefined;
            const isDatasetNull = cachedData?.dataset === null;
            const hasPublicDataset = cachedData?.dataset?.public !== undefined;
            const isPublicDatasetNull = cachedData?.dataset?.public === null;
            const publicDatasetSize =
                hasPublicDataset && !isPublicDatasetNull
                    ? JSON.stringify(cachedData.dataset.public).length
                    : 0;

            this.logger.debug(
                `[publish-sender-debug] Retrieved cached data for sending. OperationId: ${operationId}, hasCachedData: ${hasCachedData}, hasDataset: ${hasDataset}, isDatasetNull: ${isDatasetNull}, hasPublicDataset: ${hasPublicDataset}, isPublicDatasetNull: ${isPublicDatasetNull}, publicDatasetSize: ${publicDatasetSize} bytes`,
            );

            if (!hasDataset || isDatasetNull) {
                this.logger.error(
                    `[publish-sender-debug] DATASET ISSUE BEFORE SENDING! OperationId: ${operationId}, hasDataset: ${hasDataset}, isDatasetNull: ${isDatasetNull}`,
                );
            }

            if (!hasPublicDataset || isPublicDatasetNull) {
                this.logger.error(
                    `[publish-sender-debug] PUBLIC DATASET ISSUE BEFORE SENDING! OperationId: ${operationId}, hasPublicDataset: ${hasPublicDataset}, isPublicDatasetNull: ${isPublicDatasetNull}. Dataset keys: [${
                        cachedData?.dataset ? Object.keys(cachedData.dataset).join(', ') : 'N/A'
                    }]`,
                );
            }

            const { dataset } = cachedData;
            const message = {
                dataset: dataset.public,
                datasetRoot,
                blockchain,
            };

            this.logger.debug(
                `[publish-sender-debug] Prepared message for sending. OperationId: ${operationId}, datasetRoot: ${datasetRoot}, blockchain: ${blockchain}, message.dataset size: ${
                    message.dataset ? JSON.stringify(message.dataset).length : 0
                } bytes, sending to ${shardNodes.length} nodes`,
            );

            // Run all message sending operations in parallel
            await Promise.all(
                shardNodes.map((node) =>
                    this.sendAndHandleMessage(node, operationId, message, command, blockchain),
                ),
            );
        } catch (e) {
            await this.handleError(operationId, blockchain, e.message, this.errorType, true);
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.FAILED,
                operationId,
                blockchain,
            );
            return Command.empty();
        }

        return Command.empty();
    }

    async sendAndHandleMessage(node, operationId, message, command, blockchain) {
        const messageDatasetSize = message.dataset ? JSON.stringify(message.dataset).length : 0;
        const { datasetRoot } = message;

        this.logger.debug(
            `[publish-sender-debug] Sending message to node. OperationId: ${operationId}, datasetRoot: ${datasetRoot}, blockchain: ${blockchain}, targetNode: ${node.id}, protocol: ${node.protocol}, datasetSize: ${messageDatasetSize} bytes`,
        );

        const sendStartTime = Date.now();
        const response = await this.messagingService.sendProtocolMessage(
            node,
            operationId,
            message,
            NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST,
            NETWORK_MESSAGE_TIMEOUT_MILLS.PUBLISH.REQUEST,
        );
        const sendDuration = Date.now() - sendStartTime;

        const responseData = response.data;
        const responseType = response.header?.messageType;

        this.logger.debug(
            `[publish-sender-debug] Received response from node. OperationId: ${operationId}, datasetRoot: ${datasetRoot}, targetNode: ${node.id}, responseType: ${responseType}, duration: ${sendDuration}ms`,
        );

        if (response.header.messageType === NETWORK_MESSAGE_TYPES.RESPONSES.ACK) {
            this.logger.debug(
                `[publish-sender-debug] ACK received. OperationId: ${operationId}, datasetRoot: ${datasetRoot}, targetNode: ${node.id}, identityId: ${responseData.identityId}`,
            );
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
            this.logger.warn(
                `[publish-sender-debug] Non-ACK response received. OperationId: ${operationId}, datasetRoot: ${datasetRoot}, targetNode: ${node.id}, responseType: ${responseType}, errorMessage: ${responseData?.errorMessage}`,
            );
            // eslint-disable-next-line no-await-in-loop
            await this.operationService.processResponse(
                command,
                OPERATION_REQUEST_STATUS.FAILED,
                responseData,
            );
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.FAILED,
                operationId,
                blockchain,
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
            transactional: false,
            priority: COMMAND_PRIORITY.HIGHEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishReplicationCommand;
