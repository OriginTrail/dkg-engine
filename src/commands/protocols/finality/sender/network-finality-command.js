import Command from '../../../command.js';
import NetworkProtocolCommand from '../../common/network-protocol-command.js';
import {
    COMMAND_PRIORITY,
    ERROR_TYPE,
    OPERATION_ID_STATUS,
} from '../../../../constants/constants.js';

class NetworkFinalityCommand extends NetworkProtocolCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.finalityService;
        this.ualService = ctx.ualService;

        this.errorType = ERROR_TYPE.FINALITY.FINALITY_NETWORK_ERROR;
    }

    async execute(command) {
        await super.execute(command);

        const { operationId, blockchain } = command.data;

        await this.operationService.markOperationAsCompleted(operationId, blockchain, null, [
            OPERATION_ID_STATUS.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_END,
        ]);

        return Command.empty();
    }

    /**
     * Builds default networkFinalityCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'networkFinalityCommand',
            delay: 0,
            transactional: false,
            priority: COMMAND_PRIORITY.HIGHEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default NetworkFinalityCommand;
