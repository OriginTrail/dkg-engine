import ValidateAssetCommand from '../../../common/validate-asset-command.js';
import Command from '../../../command.js';
import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    PARANET_ACCESS_POLICY,
} from '../../../../constants/constants.js';

class GetValidateAssetCommand extends ValidateAssetCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.getService;
        this.errorType = ERROR_TYPE.GET.GET_VALIDATE_ASSET_ERROR;
    }

    async handleError(operationId, blockchain, errorMessage, errorType) {
        await this.operationService.markOperationAsFailed(
            operationId,
            blockchain,
            errorMessage,
            errorType,
        );
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
            knowledgeCollectionId,
            ual,
            isOperationV0,
            isV6Contract,
            paranetUAL,
        } = command.data;
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_VALIDATE_ASSET_START,
        );

        const isUAL = this.ualService.isUAL(ual);

        if (!isUAL) {
            await this.handleError(
                operationId,
                blockchain,
                `Get for operation id: ${operationId}, UAL: ${ual}: is not a UAL.`,
                this.errorType,
            );
            return Command.empty();
        }

        if (paranetUAL) {
            const {
                blockchain: paranetBlockchain,
                contract: paranetContract,
                knowledgeCollectionId: paranetKnowledgeCollectionId,
            } = this.ualService.resolveUAL(paranetUAL);

            const isParanetUAL = this.ualService.isUAL(paranetUAL);

            if (!isParanetUAL) {
                await this.handleError(
                    operationId,
                    paranetBlockchain,
                    `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: is not a UAL.`,
                    this.errorType,
                );
                return Command.empty();
            }

            const paranetId = this.paranetService.constructParanetId(
                paranetContract,
                paranetKnowledgeCollectionId,
            );

            const paranetExists = await this.blockchainModuleManager.paranetExists(
                paranetBlockchain,
                paranetId,
            );

            if (!paranetExists) {
                await this.handleError(
                    operationId,
                    paranetBlockchain,
                    `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}. Paranet does not exist.`,
                    this.errorType,
                );
                return Command.empty();
            }

            const paranetNodesAccessPolicy =
                await this.blockchainModuleManager.getNodesAccessPolicy(
                    paranetBlockchain,
                    paranetId,
                );

            // Curated paranets are currently not supported
            if (paranetNodesAccessPolicy === PARANET_ACCESS_POLICY.CURATED) {
                await this.handleError(
                    operationId,
                    paranetBlockchain,
                    `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}. Curated paranets are currently not supported.`,
                    this.errorType,
                );
                return Command.empty();
            }
        }

        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.GET.GET_VALIDATE_UAL_START,
            operationId,
            blockchain,
        );
        // TODO: Update to validate knowledge asset index
        if (!isOperationV0 && !isV6Contract) {
            const isValidUal = await this.validationService.validateUal(
                blockchain,
                contract,
                knowledgeCollectionId,
            );

            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.GET.GET_VALIDATE_UAL_END,
                operationId,
                blockchain,
            );

            if (!isValidUal) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Get for operation id: ${operationId}, UAL: ${ual}: there is no asset with this UAL.`,
                    this.errorType,
                );
                return Command.empty();
            }

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.GET.GET_VALIDATE_ASSET_END,
            );
        }

        return this.continueSequence(
            {
                ...command.data,
                retry: undefined,
                period: undefined,
            },
            command.sequence,
        );
    }

    /**
     * Builds default getValidateAssetCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'getValidateAssetCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default GetValidateAssetCommand;
