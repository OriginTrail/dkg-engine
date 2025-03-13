import NetworkProtocolCommand from '../../common/network-protocol-command.js';
import { COMMAND_PRIORITY, ERROR_TYPE } from '../../../../constants/constants.js';

class NetworkFinalityCommand extends NetworkProtocolCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.finalityService;
        this.ualService = ctx.ualService;

        this.errorType = ERROR_TYPE.FINALITY.FINALITY_NETWORK_ERROR;
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
