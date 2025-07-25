import fs from 'fs/promises';
import path from 'path';
import HandleProtocolMessageCommand from '../../../common/handle-protocol-message-command.js';
import {
    ERROR_TYPE,
    NETWORK_MESSAGE_TYPES,
    OPERATION_ID_STATUS,
    MIGRATION_FLAG_PATH,
    TRIPLE_STORE_REPOSITORY,
    TRIPLES_VISIBILITY,
    BATCH_GET_UAL_MAX_LIMIT,
    COMMAND_PRIORITY,
} from '../../../../../constants/constants.js';

class HandleBatchGetRequestCommand extends HandleProtocolMessageCommand {
    constructor(ctx) {
        super(ctx);
        this.tripleStoreService = ctx.tripleStoreService;
        this.paranetService = ctx.paranetService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.networkModuleManager = ctx.networkModuleManager;
        this.cryptoService = ctx.cryptoService;

        this.errorType = ERROR_TYPE.BATCH_GET.BATCH_GET_REQUEST_REMOTE_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_REMOTE_START;
        this.operationEndEvent = OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_REMOTE_END;
    }

    async prepareMessage(commandData) {
        const { operationId, blockchain, includeMetadata } = commandData;
        let { uals, tokenIds } = commandData;

        console.time(`HandleBatchGetRequestCommand [PREPARE]: ${operationId} ${uals.length}`);
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            this.operationStartEvent,
        );

        // Trim uals and tokenIds to the max limit of BATCH_GET_UAL_MAX_LIMIT
        uals = uals.slice(0, BATCH_GET_UAL_MAX_LIMIT);
        tokenIds = Object.fromEntries(Object.entries(tokenIds).slice(0, BATCH_GET_UAL_MAX_LIMIT));

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

        console.timeEnd(`HandleBatchGetRequestCommand [PREPARE]: ${operationId} ${uals.length}`);

        console.time(`HandleBatchGetRequestCommand [PROCESSING]: ${operationId} ${uals.length}`);

        const assertionPromise = this.tripleStoreService.getAssertionsInBatch(
            TRIPLE_STORE_REPOSITORY.DKG,
            uals,
            tokenIds,
            TRIPLES_VISIBILITY.PUBLIC,
            operationId,
        );

        promises.push(assertionPromise);

        if (includeMetadata) {
            const metadataPromise = this.tripleStoreService.getAssertionMetadataBatch(
                uals,
                tokenIds,
            );
            promises.push(metadataPromise);
        }

        const [assertions, metadata] = await Promise.all(promises);

        const responseData = {
            assertions,
            ...(includeMetadata && metadata && { metadata }),
        };

        console.timeEnd(`HandleBatchGetRequestCommand [PROCESSING]: ${operationId} ${uals.length}`);

        console.time(`HandleBatchGetRequestCommand [RESPONSE]: ${operationId} ${uals.length}`);

        if (assertions?.length) {
            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                this.operationEndEvent,
            );
        }

        console.timeEnd(`HandleBatchGetRequestCommand [RESPONSE]: ${operationId} ${uals.length}`);

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
            transactional: false,
            priority: COMMAND_PRIORITY.MEDIUM,
            errorType: this.errorType,
        };
        Object.assign(command, map);
        return command;
    }
}

export default HandleBatchGetRequestCommand;
