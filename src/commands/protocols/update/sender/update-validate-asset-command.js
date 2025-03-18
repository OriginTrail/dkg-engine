import ValidateAssetCommand from '../../../common/validate-asset-command.js';
import { OPERATION_ID_STATUS, ERROR_TYPE } from '../../../../constants/constants.js';

class UpdateValidateAssetCommand extends ValidateAssetCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.updateService;
        this.errorType = ERROR_TYPE.UPDATE.UPDATE_VALIDATE_ASSET_ERROR;
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
        const { operationId, blockchain, datasetRoot } = command.data;

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.UPDATE.UPDATE_VALIDATE_ASSET_START,
        );

        const cachedData = await this.operationIdService.getCachedOperationIdData(operationId);

        await this.validationService.validateDatasetRoot(cachedData.dataset, datasetRoot);

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.UPDATE.UPDATE_VALIDATE_ASSET_END,
        );
        return this.continueSequence(
            { ...command.data, retry: undefined, period: undefined },
            command.sequence,
        );
    }

    /**
     * Builds default updateValidateAssetCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'updateValidateAssetCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default UpdateValidateAssetCommand;
