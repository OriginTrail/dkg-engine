import Command from '../../command.js';
import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    MAX_RETRIES_READ_CACHED_PUBLISH_DATA,
    RETRY_DELAY_READ_CACHED_PUBLISH_DATA,
    TRIPLE_STORE_REPOSITORIES,
    NETWORK_MESSAGE_TYPES,
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    COMMAND_PRIORITY,
} from '../../../constants/constants.js';

class PublishFinalizationCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.ualService = ctx.ualService;
        this.fileService = ctx.fileService;
        this.messagingService = ctx.messagingService;
        this.operationService = ctx.finalityService;
        this.errorType = ERROR_TYPE.STORE_ASSERTION_ERROR;
        this.tripleStoreService = ctx.tripleStoreService;
        this.operationIdService = ctx.operationIdService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.dataService = ctx.dataService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
    }

    async execute(command) {
        const { event } = command.data;
        const eventData = JSON.parse(event.data);
        const { txHash, blockNumber } = event;
        const { id, publishOperationId, merkleRoot, byteSize } = eventData;
        const { blockchain, contractAddress } = event;
        const operationId = this.operationIdService.generateId();
        const ual = this.ualService.deriveUAL(blockchain, contractAddress, id);

        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_START,
            operationId,
            blockchain,
            publishOperationId,
        );
        let transaction;
        let blockTimestamp;
        try {
            [transaction, blockTimestamp] = await Promise.all([
                this.blockchainModuleManager.getTransaction(blockchain, txHash),
                this.blockchainModuleManager.getBlockTimestamp(blockchain, blockNumber),
            ]);
        } catch (error) {
            this.logger.error(`Failed to get transaction or block timestamp: ${error.message}`);
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.FAILED,
                operationId,
                blockchain,
                publishOperationId,
            );
            return Command.empty();
        }
        const metadata = {
            publisherKey: transaction.from.toLowerCase(),
            blockNumber,
            txHash,
            blockTimestamp,
        };
        let publisherPeerId;
        let cachedMerkleRoot;
        let assertion;
        try {
            const result = await this.readWithRetries(publishOperationId);
            cachedMerkleRoot = result.merkleRoot;
            assertion = result.assertion;
            publisherPeerId = result.remotePeerId;
        } catch (error) {
            this.logger.error(
                `[Cache] Failed to read cached publish data for UAL ${ual} (publishOperationId: ${publishOperationId}, txHash: ${txHash}, operationId: ${operationId}): ${error.message}`,
            );
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.FAILED,
                operationId,
                blockchain,
                publishOperationId,
            );
            return Command.empty();
        }

        try {
            await this.validatePublishData(merkleRoot, cachedMerkleRoot, byteSize, assertion, ual);
        } catch (e) {
            this.logger.error(`Failed to validate publish data: ${e.message}`);
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.FAILED,
                operationId,
                blockchain,
                publishOperationId,
            );
            return Command.empty();
        }

        try {
            await this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_STORE_ASSERTION_START,
                operationId,
                blockchain,
            );

            const totalTriples = await this.tripleStoreService.insertKnowledgeCollection(
                TRIPLE_STORE_REPOSITORIES.DKG,
                ual,
                assertion,
                metadata,
            );

            await this.repositoryModuleManager.incrementInsertedTriples(totalTriples ?? 0);
            this.logger.info(`Number of triples added to the database +${totalTriples}`);

            await this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_STORE_ASSERTION_END,
                operationId,
                blockchain,
            );

            const myPeerId = this.networkModuleManager.getPeerId().toB58String();
            if (publisherPeerId === myPeerId) {
                await this.repositoryModuleManager.saveFinalityAck(
                    publishOperationId,
                    ual,
                    publisherPeerId,
                );

                for (const status of this.operationService.completedStatuses) {
                    this.operationIdService.emitChangeEvent(status, operationId, blockchain);
                }
            } else {
                const networkProtocols = this.operationService.getNetworkProtocols();
                const node = { id: publisherPeerId, protocol: networkProtocols[0] };

                const message = { ual, publishOperationId, blockchain, operationId };
                // TODO: Add retry logic maybe
                const response = await this.messagingService.sendProtocolMessage(
                    node,
                    operationId,
                    message,
                    NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST,
                    NETWORK_MESSAGE_TIMEOUT_MILLS.FINALITY.REQUEST,
                );

                await this.messagingService.handleProtocolResponse(
                    response,
                    this.operationService,
                    blockchain,
                    operationId,
                );
            }
        } catch (e) {
            this.logger.error(`Command error (${this.errorType}): ${e.message}`);

            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.FAILED,
                operationId,
                blockchain,
                publishOperationId,
            );
        }

        return Command.empty();
    }

    async validatePublishData(merkleRoot, cachedMerkleRoot, byteSize, assertion, ual) {
        if (merkleRoot !== cachedMerkleRoot) {
            const errorMessage = `Invalid Merkle Root for Knowledge Collection: ${ual}. Received value from blockchain: ${merkleRoot}, Cached value from publish operation: ${cachedMerkleRoot}`;

            throw new Error(errorMessage);
        }

        const calculatedAssertionSize = this.dataService.calculateAssertionSize(
            assertion.public ?? assertion,
        );

        if (byteSize.toString() !== calculatedAssertionSize.toString()) {
            const errorMessage = `Invalid Assertion Size for Knowledge Collection: ${ual}. Received value from blockchain: ${byteSize}, Calculated value: ${calculatedAssertionSize}`;

            throw new Error(errorMessage);
        }
    }

    async readWithRetries(publishOperationId) {
        let attempt = 0;
        const datasetPath = this.fileService.getPendingStorageDocumentPath(publishOperationId);

        while (attempt < MAX_RETRIES_READ_CACHED_PUBLISH_DATA) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const cachedData = await this.fileService.readFile(datasetPath, true);
                return cachedData;
            } catch (error) {
                attempt += 1;
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, RETRY_DELAY_READ_CACHED_PUBLISH_DATA);
                });
            }
        }
        this.logger.error(
            `[Cache] Exhausted retries reading cached publish data (publishOperationId: ${publishOperationId}, path: ${datasetPath}).`,
        );
        // TODO: Mark this operation as failed
        throw new Error('Failed to read cached publish data');
    }

    /**
     * Builds default readCachedPublishDataCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'publishFinalizationCommand',
            transactional: false,
            priority: COMMAND_PRIORITY.HIGHEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishFinalizationCommand;
