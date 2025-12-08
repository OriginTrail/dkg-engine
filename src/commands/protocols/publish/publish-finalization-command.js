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
        this.errorType = ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_TRIPLE_STORE_ERROR;
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

        this.logger.debug(
            `[PUBLISH] Starting publish finalization for operationId: ${operationId}, ` +
                `publishOperationId: ${publishOperationId}, blockchain: ${blockchain}, txHash: ${txHash}`,
        );

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
            await this.handleError(
                operationId,
                blockchain,
                `Failed to get transaction or block timestamp for txHash: ${txHash}, blockNumber: ${blockNumber}. Error: ${error.message}`,
                ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_BLOCKCHAIN_ERROR,
                true,
            );
            return Command.empty();
        }

        this.logger.info(
            `[PUBLISH] Retrieved blockchain transaction for operationId: ${operationId}, ` +
                `txHash: ${txHash}, from: ${transaction.from}, to: ${transaction.to}, ` +
                `contract: ${contractAddress}, blockNumber: ${blockNumber}, blockchain: ${blockchain}`,
        );

        this.logger.debug(
            `[PUBLISH] Transaction event data for operationId: ${operationId}, ` +
                `tokenId: ${id}, merkleRoot: ${merkleRoot}, byteSize: ${byteSize}, ` +
                `blockTimestamp: ${blockTimestamp}`,
        );

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
            const result = await this.readWithRetries(operationId, publishOperationId);
            cachedMerkleRoot = result.merkleRoot;
            assertion = result.assertion;
            publisherPeerId = result.remotePeerId;
        } catch (error) {
            await this.handleError(
                operationId,
                blockchain,
                `Failed to read cached publish data for publishOperationId: ${publishOperationId}. Error: ${error.message}`,
                ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_NO_CACHED_DATA,
                true,
            );
            return Command.empty();
        }

        const ual = this.ualService.deriveUAL(blockchain, contractAddress, id);

        this.logger.debug(
            `[PUBLISH] Validating publish data for operationId: ${operationId}, ` +
                `publishOperationId: ${publishOperationId}, UAL: ${ual}`,
        );

        try {
            await this.validatePublishData(merkleRoot, cachedMerkleRoot, byteSize, assertion, ual);
        } catch (error) {
            await this.handleError(
                operationId,
                blockchain,
                `Failed to validate publish data for UAL: ${ual}. Error: ${error.message}`,
                ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_VALIDATION_ERROR,
                true,
            );
            return Command.empty();
        }

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_STORE_ASSERTION_START,
            operationId,
            blockchain,
        );

        try {
            const totalTriples = await this.tripleStoreService.insertKnowledgeCollection(
                TRIPLE_STORE_REPOSITORIES.DKG,
                ual,
                assertion,
                metadata,
            );

            await this.repositoryModuleManager.incrementInsertedTriples(totalTriples ?? 0);
            this.logger.info(
                `[PUBLISH] Number of triples added to the database +${totalTriples} for operationId: ${operationId}, ` +
                    `publishOperationId: ${publishOperationId}, UAL: ${ual}`,
            );
        } catch (error) {
            await this.handleError(
                operationId,
                blockchain,
                `Failed to insert knowledge collection for UAL: ${ual}. Error: ${error.message}`,
                ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_TRIPLE_STORE_ERROR,
                true,
            );
            return Command.empty();
        }

        await this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_STORE_ASSERTION_END,
            operationId,
            blockchain,
        );

        const myPeerId = this.networkModuleManager.getPeerId().toB58String();
        if (publisherPeerId === myPeerId) {
            this.logger.debug(
                `[PUBLISH] Node is the publisher for operationId: ${operationId}, publishOperationId: ${publishOperationId}, ` +
                    `UAL: ${ual}, saving finality acknowledgment locally`,
            );
            try {
                await this.repositoryModuleManager.saveFinalityAck(
                    publishOperationId,
                    ual,
                    publisherPeerId,
                );
            } catch (error) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Failed to save finality acknowledgment for UAL: ${ual}, publishOperationId: ${publishOperationId}. Error: ${error.message}`,
                    ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_ACK_ERROR,
                    true,
                );
                return Command.empty();
            }

            this.logger.info(
                `[PUBLISH] Publish finalization completed successfully for operationId: ${operationId}, ` +
                    `publishOperationId: ${publishOperationId}, UAL: ${ual}`,
            );

            for (const status of this.operationService.completedStatuses) {
                this.operationIdService.emitChangeEvent(status, operationId, blockchain);
            }
        } else {
            this.logger.debug(
                `[PUBLISH] Sending finality acknowledgment to publisher node: ${publisherPeerId} for ` +
                    `operationId: ${operationId}, publishOperationId: ${publishOperationId}, UAL: ${ual}`,
            );
            try {
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

                this.logger.info(
                    `[PUBLISH] Publish finalization completed successfully for operationId: ${operationId}, ` +
                        `publishOperationId: ${publishOperationId}, UAL: ${ual}, notified publisher: ${publisherPeerId}`,
                );
            } catch (error) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Failed to send finality message to publisher node: ${publisherPeerId} for UAL: ${ual}. Error: ${error.message}`,
                    ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_NETWORK_ERROR,
                    true,
                );
                return Command.empty();
            }
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

    async readWithRetries(operationId, publishOperationId) {
        let attempt = 0;
        let lastError;
        const datasetPath = this.fileService.getPendingStorageDocumentPath(publishOperationId);

        while (attempt < MAX_RETRIES_READ_CACHED_PUBLISH_DATA) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const cachedData = await this.fileService.readFile(datasetPath, true);
                return cachedData;
            } catch (error) {
                lastError = error;
                attempt += 1;

                this.logger.warn(
                    `[PUBLISH] Attempt ${attempt}/${MAX_RETRIES_READ_CACHED_PUBLISH_DATA} to read cached publish data failed. ` +
                        `operationId: ${operationId}, publishOperationId: ${publishOperationId}, path: ${datasetPath}. Error: ${error.message}`,
                );

                if (attempt < MAX_RETRIES_READ_CACHED_PUBLISH_DATA) {
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((resolve) => {
                        setTimeout(resolve, RETRY_DELAY_READ_CACHED_PUBLISH_DATA);
                    });
                }
            }
        }

        throw new Error(
            `Failed to read cached publish data after ${MAX_RETRIES_READ_CACHED_PUBLISH_DATA} attempts. ` +
                `Path: ${datasetPath}. Last error: ${lastError?.message}`,
        );
    }

    /**
     * Builds default publishFinalizationCommand
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
