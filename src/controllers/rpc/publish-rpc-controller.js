import BaseController from './base-rpc-controller.js';
import { NETWORK_MESSAGE_TYPES, COMMAND_PRIORITY } from '../../constants/constants.js';

class PublishController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.publishService;
        this.commandExecutor = ctx.commandExecutor;
        this.operationIdService = ctx.operationIdService;
    }

    async v1_0_0HandleRequest(message, remotePeerId, protocol) {
        const { operationId, messageType } = message.header;
        const { blockchain, contract, tokenId, datasetRoot } = message.data || {};

        // Derive UAL if possible
        const ual =
            blockchain && contract && tokenId
                ? `did:dkg:${blockchain}/${contract}/${tokenId}`
                : 'N/A';

        this.logger.debug(
            `[publish-rpc-debug] Received request. OperationId: ${operationId}, UAL: ${ual}, messageType: ${messageType}, remotePeerId: ${remotePeerId}, protocol: ${protocol}, blockchain: ${blockchain}, datasetRoot: ${datasetRoot}`,
        );

        // Log the incoming message data structure
        const messageDataKeys = message.data ? Object.keys(message.data) : [];
        const hasDataset = message.data?.dataset !== undefined;
        const isDatasetNull = message.data?.dataset === null;
        const datasetType = typeof message.data?.dataset;
        const datasetSize =
            hasDataset && !isDatasetNull ? JSON.stringify(message.data.dataset).length : 0;

        this.logger.debug(
            `[publish-rpc-debug] Message data. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, keys: [${messageDataKeys.join(
                ', ',
            )}], hasDataset: ${hasDataset}, isDatasetNull: ${isDatasetNull}, datasetType: ${datasetType}, datasetSize: ${datasetSize} bytes`,
        );

        if (isDatasetNull) {
            this.logger.error(
                `[publish-rpc-debug] RECEIVED NULL DATASET! OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}. This is likely the root cause of cache issues.`,
            );
        }

        if (!hasDataset) {
            this.logger.error(
                `[publish-rpc-debug] RECEIVED NO DATASET (undefined)! OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}. Full message.data: ${JSON.stringify(
                    message.data,
                )?.substring(0, 1000)}`,
            );
        }

        const command = { sequence: [], transactional: false, data: {} };
        const [handleRequestCommand] = this.getCommandSequence(protocol);
        if (messageType === NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST) {
            Object.assign(command, {
                name: handleRequestCommand,
                priority: COMMAND_PRIORITY.HIGHEST,
            });

            this.logger.debug(
                `[publish-rpc-debug] Caching operation data. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, datasetSize: ${datasetSize} bytes`,
            );

            await this.operationIdService.cacheOperationIdDataToMemory(operationId, {
                dataset: message.data.dataset,
                datasetRoot: message.data.datasetRoot,
            });

            await this.operationIdService.cacheOperationIdDataToFile(operationId, {
                dataset: message.data.dataset,
                datasetRoot: message.data.datasetRoot,
            });

            this.logger.debug(
                `[publish-rpc-debug] Operation data cached. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
            );
        } else {
            this.logger.error(
                `[publish-rpc-debug] Unknown message type: ${messageType}. OperationId: ${operationId}, UAL: ${ual}`,
            );
            throw new Error('Unknown message type');
        }

        command.data = {
            ...command.data,
            remotePeerId,
            operationId,
            protocol,
            dataset: message.data.dataset,
            datasetRoot: message.data.datasetRoot,
            blockchain: message.data.blockchain,
            isOperationV0: message.data.isOperationV0,
            contract: message.data.contract,
            tokenId: message.data.tokenId,
        };

        this.logger.debug(
            `[publish-rpc-debug] Adding command to executor. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, command: ${handleRequestCommand}`,
        );

        await this.commandExecutor.add(command);
    }
}

export default PublishController;
