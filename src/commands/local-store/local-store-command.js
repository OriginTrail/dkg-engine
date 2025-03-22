import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    OPERATION_REQUEST_STATUS,
    NETWORK_MESSAGE_TYPES,
    NETWORK_SIGNATURES_FOLDER,
    PUBLISHER_NODE_SIGNATURES_FOLDER,
} from '../../constants/constants.js';
import Command from '../command.js';

class LocalStoreCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.operationIdService = ctx.operationIdService;
        this.operationService = ctx.publishService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.signatureService = ctx.signatureService;
        this.cryptoService = ctx.cryptoService;

        this.errorType = ERROR_TYPE.LOCAL_STORE.LOCAL_STORE_ERROR;
    }

    async execute(command) {
        const {
            operationId,
            blockchain,
            datasetRoot,
            minimumNumberOfNodeReplications,
            batchSize,
            nodePartOfShard,
        } = command.data;

        try {
            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.LOCAL_STORE.LOCAL_STORE_START,
            );

            let v;
            let r;
            let s;
            let vs;
            const identityId = await this.blockchainModuleManager.getIdentityId(blockchain);
            if (nodePartOfShard) {
                ({ v, r, s, vs } = await this.signatureService.signMessage(
                    blockchain,
                    datasetRoot,
                ));
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

            const batchSizePar = this.operationService.getBatchSize(batchSize);
            const minAckResponses = this.operationService.getMinAckResponses(
                minimumNumberOfNodeReplications,
            );

            const updatedData = {
                ...command.data,
                batchSize: batchSizePar,
                minAckResponses,
            };
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
            } else {
                await this.operationService.processResponse(
                    { ...command, data: updatedData },
                    OPERATION_REQUEST_STATUS.FAILED,
                    {},
                    'Node is not part of the shard.',
                );
            }
        } catch (e) {
            await this.handleError(operationId, blockchain, e.message, this.errorType, true);
            return Command.empty();
        }

        return Command.empty();
    }

    /**
     * Builds default localStoreCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'localStoreCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default LocalStoreCommand;
