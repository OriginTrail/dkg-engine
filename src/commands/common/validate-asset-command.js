import Command from '../command.js';
import {
    ERROR_TYPE,
    OPERATION_ID_STATUS,
    LOCAL_STORE_TYPES,
    PARANET_ACCESS_POLICY,
} from '../../constants/constants.js';

class ValidateAssetCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.ualService = ctx.ualService;
        this.dataService = ctx.dataService;
        this.validationService = ctx.validationService;
        this.paranetService = ctx.paranetService;

        this.errorType = ERROR_TYPE.VALIDATE_ASSET_ERROR;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const {
            operationId,
            blockchain,
            contract,
            tokenId,
            storeType = LOCAL_STORE_TYPES.TRIPLE,
            paranetUAL,
        } = command.data;

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.VALIDATE_ASSET_START,
        );

        // TODO: Validate number of triplets and other stuff we did before so it matches like we did it in v6
        const cachedData = await this.operationIdService.getCachedOperationIdData(operationId);
        const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);

        // backwards compatibility
        const cachedAssertion = cachedData.datasetRoot || cachedData.public.assertionId;
        const cachedDataset = cachedData.dataset || cachedData.public.assertion;

        // V0 backwards compatibility
        if (cachedData.private?.assertionId && cachedData.private?.assertion) {
            this.logger.info(
                `Validating asset's private assertion with id: ${cachedData.private.assertionId} ual: ${ual}`,
            );

            try {
                await this.validationService.validateDatasetRoot(
                    cachedData.private.assertion,
                    cachedData.private.assertionId,
                );
            } catch (error) {
                await this.handleError(
                    operationId,
                    blockchain,
                    error.message,
                    this.errorType,
                    true,
                );
                return Command.empty();
            }
        }

        await this.validationService.validateDatasetRoot(cachedDataset, cachedAssertion);

        let paranetId;
        if (storeType === LOCAL_STORE_TYPES.TRIPLE_PARANET) {
            try {
                const {
                    blockchain: paranetBlockchain,
                    contract: paranetContract,
                    knowledgeCollectionId: paranetKnowledgeCollectionId,
                    knowledgeAssetId: paranetKnowledgeAssetId,
                } = this.ualService.resolveUAL(paranetUAL);

                if (!paranetKnowledgeAssetId) {
                    await this.handleError(
                        operationId,
                        blockchain,
                        `Invalid paranet UAL: ${paranetUAL} . Knowledge asset token id is required!`,
                        this.errorType,
                        true,
                    );
                    return Command.empty();
                }

                paranetId = this.paranetService.constructParanetId(
                    paranetContract,
                    paranetKnowledgeCollectionId,
                    paranetKnowledgeAssetId,
                );
                const paranetExists = await this.blockchainModuleManager.paranetExists(
                    paranetBlockchain,
                    paranetId,
                );
                if (!paranetExists) {
                    await this.handleError(
                        operationId,
                        blockchain,
                        `Paranet: ${paranetId} doesn't exist.`,
                        this.errorType,
                        true,
                    );
                    return Command.empty();
                }

                const nodesAccessPolicy = await this.blockchainModuleManager.getNodesAccessPolicy(
                    blockchain,
                    paranetId,
                );
                if (nodesAccessPolicy === PARANET_ACCESS_POLICY.CURATED) {
                    const identityId = await this.blockchainModuleManager.getIdentityId(blockchain);
                    const isCuratedNode = await this.blockchainModuleManager.isCuratedNode(
                        blockchain,
                        paranetId,
                        identityId,
                    );
                    if (!isCuratedNode) {
                        await this.handleError(
                            operationId,
                            blockchain,
                            `Node is not part of curated paranet ${paranetId}  because node with id ${identityId} is not a curated node.`,
                            this.errorType,
                            true,
                        );
                        return Command.empty();
                    }
                } else {
                    await this.handleError(
                        operationId,
                        blockchain,
                        `Paranet ${paranetId} is not curated paranet.`,
                        this.errorType,
                        true,
                    );
                    return Command.empty();
                }
            } catch (error) {
                await this.handleError(
                    operationId,
                    blockchain,
                    error.message,
                    this.errorType,
                    true,
                );
                return Command.empty();
            }
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.VALIDATE_ASSET_END,
        );
        return this.continueSequence(
            { ...command.data, paranetId, retry: undefined, period: undefined },
            command.sequence,
        );
    }

    async retryFinished(command) {
        const { blockchain, contract, tokenId, operationId } = command.data;
        const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);
        await this.handleError(
            operationId,
            blockchain,
            `Max retry count for command: ${command.name} reached! Unable to validate ual: ${ual}`,
            this.errorType,
            true,
        );
    }

    /**
     * Builds default validateAssetCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'validateAssetCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default ValidateAssetCommand;
