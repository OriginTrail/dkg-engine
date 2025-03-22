import Command from '../../command.js';
import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    MAX_RETRIES_READ_CACHED_PUBLISH_DATA,
    RETRY_DELAY_READ_CACHED_PUBLISH_DATA,
    TRIPLE_STORE_REPOSITORIES,
    NETWORK_MESSAGE_TYPES,
    NETWORK_MESSAGE_TIMEOUT_MILLS,
} from '../../../constants/constants.js';

class ReadCachedPublishDataCommand extends Command {
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
    }

    async execute(command) {
        const { event } = command.data;
        const eventData = JSON.parse(event.data);
        const { id, publishOperationId, merkleRoot, byteSize } = eventData;
        const { blockchain, contractAddress } = event;
        const operationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_START,
            publishOperationId,
        );

        let cachedMerkleRoot;
        let assertion;
        let publisherPeerId;
        try {
            const result = await this.readWithRetries(publishOperationId);
            cachedMerkleRoot = result.merkleRoot;
            assertion = result.assertion;
            publisherPeerId = result.remotePeerId;
        } catch (error) {
            this.logger.error(`Failed to read cached publish data: ${error.message}`); // TODO: Make this log more descriptive
            return Command.empty();
        }

        const ual = this.ualService.deriveUAL(blockchain, contractAddress, id);

        try {
            await this.validatePublishData(
                operationId,
                blockchain,
                merkleRoot,
                cachedMerkleRoot,
                byteSize,
                assertion,
                ual,
            );
        } catch (e) {
            return Command.empty();
        }

        try {
            await this.tripleStoreService.insertKnowledgeCollection(
                TRIPLE_STORE_REPOSITORIES.DKG,
                ual,
                assertion,
            );

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_STORE_ASSERTION_END,
            );

            const myPeerId = this.networkModuleManager.getPeerId().toB58String();
            if (publisherPeerId === myPeerId) {
                await this.repositoryModuleManager.saveFinalityAck(
                    publishOperationId,
                    ual,
                    publisherPeerId,
                );
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
            await this.handleError(operationId, blockchain, e.message, this.errorType, true);
        }

        return Command.empty();
    }

    async validatePublishData(
        operationId,
        blockchain,
        merkleRoot,
        cachedMerkleRoot,
        byteSize,
        assertion,
        ual,
    ) {
        try {
            if (merkleRoot !== cachedMerkleRoot) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Invalid Merkle Root for Knowledge Collection: ${ual}. Received value from blockchain: ${merkleRoot}, Cached value from publish operation: ${cachedMerkleRoot}`,
                    this.errorType,
                    true,
                );
            }

            const calculatedAssertionSize = this.dataService.calculateAssertionSize(
                assertion.public ?? assertion,
            );

            if (byteSize.toString() !== calculatedAssertionSize.toString()) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Invalid Assertion Size for Knowledge Collection: ${ual}. Received value from blockchain: ${byteSize}, Calculated value: ${calculatedAssertionSize}`,
                    this.errorType,
                    true,
                );
            }
        } catch (e) {
            await this.handleError(operationId, blockchain, e.message, this.errorType, true);
            throw e;
        }
    }

    async readWithRetries(publishOperationId) {
        let attempt = 0;

        while (attempt < MAX_RETRIES_READ_CACHED_PUBLISH_DATA) {
            try {
                const datasetPath =
                    this.fileService.getPendingStorageDocumentPath(publishOperationId);
                // eslint-disable-next-line no-await-in-loop
                const cachedData = await this.fileService.readFile(datasetPath, true);
                return cachedData; // Success - exit loop and return data
            } catch (error) {
                attempt += 1;

                if (attempt === MAX_RETRIES_READ_CACHED_PUBLISH_DATA) {
                    return Command.retry(); // All retries failed
                }

                // Wait 5 seconds before next attempt
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, RETRY_DELAY_READ_CACHED_PUBLISH_DATA);
                });
            }
        }
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
            name: 'readCachedPublishDataCommand',
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default ReadCachedPublishDataCommand;
