import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    LOCAL_STORE_TYPES,
    OPERATION_REQUEST_STATUS,
    NETWORK_MESSAGE_TYPES,
    NETWORK_SIGNATURES_FOLDER,
    PUBLISHER_NODE_SIGNATURES_FOLDER,
} from '../../constants/constants.js';
import Command from '../command.js';

class LocalStoreCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.tripleStoreService = ctx.tripleStoreService;
        this.paranetService = ctx.paranetService;
        this.pendingStorageService = ctx.pendingStorageService;
        this.operationIdService = ctx.operationIdService;
        this.operationService = ctx.publishService;
        this.dataService = ctx.dataService;
        this.ualService = ctx.ualService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.commandExecutor = ctx.commandExecutor;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.signatureService = ctx.signatureService;
        this.cryptoService = ctx.cryptoService;

        this.errorType = ERROR_TYPE.LOCAL_STORE.LOCAL_STORE_ERROR;
    }

    async execute(command) {
        const {
            operationId,
            blockchain,
            storeType = LOCAL_STORE_TYPES.TRIPLE,
            paranetId,
            datasetRoot,
            isOperationV0,
            contract,
            tokenId,
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

            const cachedData = await this.operationIdService.getCachedOperationIdData(operationId);

            if (storeType === LOCAL_STORE_TYPES.TRIPLE) {
                const storePromises = [];

                if (isOperationV0) {
                    if (cachedData.public?.assertion && cachedData.public?.assertionId) {
                        const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);

                        storePromises.push(
                            this.tripleStoreService.createV6KnowledgeCollection(
                                cachedData.public.assertion,
                                ual,
                                cachedData.private.assertion,
                            ),
                        );
                    }
                }

                await Promise.all(storePromises);
            } else if (storeType === LOCAL_STORE_TYPES.TRIPLE_PARANET) {
                const paranetMetadata = await this.blockchainModuleManager.getParanetMetadata(
                    blockchain,
                    paranetId,
                );

                const paranetUAL = this.ualService.deriveUAL(
                    blockchain,
                    paranetMetadata.paranetKAStorageContract,
                    paranetMetadata.paranetKATokenId,
                );
                const paranetRepository = this.paranetService.getParanetRepositoryName(paranetUAL);

                await this.tripleStoreModuleManager.initializeParanetRepository(paranetRepository);

                await this.paranetService.initializeParanetRecord(blockchain, paranetId);

                if (isOperationV0 && cachedData && cachedData.datasetRoot) {
                    // await this.tripleStoreService.localStoreAsset(
                    //     paranetRepository,
                    //     cachedData.public.assertionId,
                    //     cachedData.public.assertion,
                    //     blockchain,
                    //     contract,
                    //     tokenId,
                    //     keyword,
                    //     LOCAL_INSERT_FOR_CURATED_PARANET_MAX_ATTEMPTS,
                    //     LOCAL_INSERT_FOR_CURATED_PARANET_RETRY_DELAY,
                    // );
                }
                if (isOperationV0 && cachedData && cachedData.datasetRoot) {
                    // await this.tripleStoreService.localStoreAsset(
                    //     paranetRepository,
                    //     cachedData.private.assertionId,
                    //     cachedData.private.assertion,
                    //     blockchain,
                    //     contract,
                    //     tokenId,
                    //     keyword,
                    //     LOCAL_INSERT_FOR_CURATED_PARANET_MAX_ATTEMPTS,
                    //     LOCAL_INSERT_FOR_CURATED_PARANET_RETRY_DELAY,
                    // );
                }

                await this.repositoryModuleManager.incrementParanetKaCount(paranetId, blockchain);
                // await this.repositoryModuleManager.createParanetSyncedAssetRecord(
                //     blockchain,
                //     this.ualService.deriveUAL(blockchain, contract, tokenId),
                //     paranetUAL,
                //     cachedData.public.datasetRoot,
                //     cachedData.private?.assertionId,
                //     cachedData.sender,
                //     cachedData.txHash,
                //     PARANET_SYNC_SOURCES.LOCAL_STORE,
                // );
            }

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.LOCAL_STORE.LOCAL_STORE_END,
            );

            if (isOperationV0) {
                await this.operationIdService.updateOperationIdStatus(
                    operationId,
                    blockchain,
                    OPERATION_ID_STATUS.COMPLETED,
                );

                return Command.empty();
            }
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
