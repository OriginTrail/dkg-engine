import Command from '../../command.js';
import { NETWORK_MESSAGE_TYPES, OPERATION_ID_STATUS } from '../../../constants/constants.js';

class HandleProtocolMessageCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.ualService = ctx.ualService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.operationIdService = ctx.operationIdService;
        this.shardingTableService = ctx.shardingTableService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;

        this.operationStartEvent = OPERATION_ID_STATUS.HANDLE_PROTOCOL_MESSAGE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.HANDLE_PROTOCOL_MESSAGE_END;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const { remotePeerId, operationId, protocol, blockchain } = command.data;

        this.operationIdService.emitChangeEvent(this.operationStartEvent, operationId, blockchain);

        try {
            const { messageType, messageData } = await this.prepareMessage(command.data);

            await this.networkModuleManager.sendMessageResponse(
                protocol,
                remotePeerId,
                messageType,
                operationId,
                messageData,
            );
        } catch (error) {
            if (command.retries) {
                this.logger.warn(error.message);
                return Command.retry();
            }
            await this.handleError(error.message, command);
        }

        this.networkModuleManager.removeCachedSession(operationId, remotePeerId);

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            this.operationEndEvent,
        );

        return Command.empty();
    }

    async prepareMessage() {
        throw Error('prepareMessage not implemented');
    }

    async validateShard(blockchain) {
        const peerId = this.networkModuleManager.getPeerId().toB58String();
        const isNodePartOfShard = await this.shardingTableService.isNodePartOfShard(
            blockchain,
            peerId,
        );

        return isNodePartOfShard;
    }

    async validateAssertionId(blockchain, contract, tokenId, assertionId, ual) {
        const blockchainAssertionId =
            await this.blockchainModuleManager.getKnowledgeCollectionMerkleRoot(
                blockchain,
                contract,
                tokenId,
            );
        if (blockchainAssertionId !== assertionId) {
            throw Error(
                `Invalid assertion id for asset ${ual}. Received value from blockchain: ${blockchainAssertionId}, received value from request: ${assertionId}`,
            );
        }
    }

    async validateReceivedData(operationId, datasetRoot, dataset, blockchain, isOperationV0) {
        this.logger.trace(`Validating shard for datasetRoot: ${datasetRoot}`);
        const isShardValid = await this.validateShard(blockchain);
        if (!isShardValid) {
            this.logger.warn(
                `Invalid shard on blockchain: ${blockchain}, operationId: ${operationId}`,
            );
            return {
                messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                messageData: { errorMessage: 'Invalid neighbourhood' },
            };
        }

        if (!isOperationV0) {
            try {
                await this.validationService.validateDatasetRoot(dataset, datasetRoot);
            } catch (error) {
                return {
                    messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                    messageData: {
                        errorMessage: error.message,
                    },
                };
            }
        }

        return { messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK, messageData: {} };
    }

    async handleError(errorMessage, command) {
        const { operationId, blockchain, remotePeerId, protocol } = command.data;

        this.logger.error(`Command error (${this.errorType}): ${errorMessage}`);
        if (errorMessage !== null) {
            this.logger.debug(`Marking operation id ${operationId} as failed`);
            await this.operationIdService.removeOperationIdCache(operationId);
        }
        this.operationIdService.emitChangeEvent(
            this.errorType,
            operationId,
            blockchain,
            errorMessage,
            this.errorType,
        );

        try {
            await this.networkModuleManager.sendMessageResponse(
                protocol,
                remotePeerId,
                NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                operationId,
                { errorMessage },
            );
        } catch (sendErr) {
            this.logger.debug(
                `Failed to send NACK to ${remotePeerId} for operation ${operationId}: ${sendErr.message}`,
            );
        }
        this.networkModuleManager.removeCachedSession(operationId, remotePeerId);
    }
}

export default HandleProtocolMessageCommand;
