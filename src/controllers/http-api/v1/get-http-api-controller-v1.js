import {
    OPERATION_ID_STATUS,
    OPERATION_STATUS,
    ERROR_TYPE,
    TRIPLES_VISIBILITY,
    V6_CONTENT_STORAGE_MAP,
    TRIPLE_STORE_REPOSITORIES,
} from '../../../constants/constants.js';
import BaseController from '../base-http-api-controller.js';

class GetController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.operationIdService = ctx.operationIdService;
        this.operationService = ctx.getService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.ualService = ctx.ualService;
        this.validationService = ctx.validationService;
        this.fileService = ctx.fileService;
    }

    async handleRequest(req, res) {
        const operationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.GET.GET_START,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            null,
            OPERATION_ID_STATUS.GET.GET_INIT_START,
        );

        this.returnResponse(res, 202, {
            operationId,
        });

        await this.repositoryModuleManager.createOperationRecord(
            this.operationService.getOperationName(),
            operationId,
            OPERATION_STATUS.IN_PROGRESS,
        );

        let tripleStoreMigrationAlreadyExecuted = false;
        try {
            tripleStoreMigrationAlreadyExecuted =
                (await this.fileService.readFile(
                    '/root/ot-node/data/migrations/v8DataMigration',
                )) === 'MIGRATED';
        } catch (e) {
            this.logger.warn(`No triple store migration file error: ${e}`);
        }
        let blockchain;
        let contract;
        let knowledgeCollectionId;
        let knowledgeAssetId;
        try {
            const { paranetUAL, includeMetadata, contentType } = req.body;
            // Why we resolve and than derive?
            let { id } = req.body;
            ({ blockchain, contract, knowledgeCollectionId, knowledgeAssetId } =
                this.ualService.resolveUAL(id));
            contract = contract.toLowerCase();
            id = this.ualService.deriveUAL(
                blockchain,
                contract,
                knowledgeCollectionId,
                knowledgeAssetId,
            );

            this.logger.info(`Get for ${id} with operation id ${operationId} initiated.`);

            // Get assertionId - datasetRoot
            //

            const isV6Contract = Object.values(V6_CONTENT_STORAGE_MAP).some((ca) =>
                ca.toLowerCase().includes(contract.toLowerCase()),
            );

            const commandSequence = [];
            // TODO: If the request is invalid, return 400 (or some other bad request code)
            // const isValidRequest = await this.validateAsset(
            //     id,
            //     paranetUAL,
            //     false, // isOperationV0,
            //     isV6Contract,
            //     blockchain,
            //     contract,
            //     knowledgeCollectionId,
            // );

            if (!tripleStoreMigrationAlreadyExecuted && isV6Contract) {
                this.logger.info(
                    `Getting assertion id and operation id ${operationId} for ual: ${id}`,
                );

                let assertionId = await this.tripleStoreService.getLatestAssertionId(
                    TRIPLE_STORE_REPOSITORIES.PUBLIC_CURRENT,
                    id,
                );

                if (!assertionId) {
                    assertionId = await this.tripleStoreService.getLatestAssertionId(
                        TRIPLE_STORE_REPOSITORIES.PRIVATE_CURRENT,
                        id,
                    );
                }
            }
            commandSequence.push('getFindShardCommand');

            await this.commandExecutor.add({
                name: commandSequence[0],
                sequence: commandSequence.slice(1),
                delay: 0,
                data: {
                    ual: id,
                    includeMetadata,
                    blockchain,
                    contract,
                    knowledgeCollectionId,
                    knowledgeAssetId,
                    operationId,
                    paranetUAL,
                    isV6Contract,
                    contentType: contentType ?? TRIPLES_VISIBILITY.ALL,
                },
                transactional: false,
            });

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.GET.GET_INIT_END,
            );
        } catch (error) {
            this.logger.error(`Error while initializing get data: ${error.message}.`);

            await this.operationService.markOperationAsFailed(
                operationId,
                blockchain,
                'Unable to get data, Failed to process input data!',
                ERROR_TYPE.GET.GET_ROUTE_ERROR,
            );
        }
    }

    async validateAsset(
        ual,
        paranetUAL,
        isOperationV0,
        isV6Contract,
        blockchain,
        contract,
        knowledgeCollectionId,
    ) {
        const isUAL = this.ualService.isUAL(ual);

        if (!isUAL) {
            return false;
        }

        if (paranetUAL) {
            const isParanetUAL = this.ualService.isUAL(paranetUAL);

            if (!isParanetUAL) {
                return false;
            }

            const {
                blockchain: paranetBlockchain,
                contract: paranetContract,
                knowledgeCollectionId: paranetKnowledgeCollectionId,
                knowledgeAssetId: paranetKnowledgeAssetId,
            } = this.ualService.resolveUAL(paranetUAL);

            if (!paranetKnowledgeAssetId) {
                return false;
            }

            const paranetId = this.paranetService.constructParanetId(
                paranetContract,
                paranetKnowledgeCollectionId,
                paranetKnowledgeAssetId,
            );

            const paranetExists = await this.blockchainModuleManager.paranetExists(
                paranetBlockchain,
                paranetId,
            );

            if (!paranetExists) {
                return false;
            }
        }

        // TODO: Update to validate knowledge asset index
        if (!isOperationV0 && !isV6Contract) {
            const isValidUal = await this.validationService.validateUal(
                blockchain,
                contract,
                knowledgeCollectionId,
            );

            if (!isValidUal) {
                return false;
            }
        }

        return true;
    }
}

export default GetController;
