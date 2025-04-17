import NetworkProtocolCommand from '../../common/network-protocol-command.js';
import { ERROR_TYPE } from '../../../../constants/constants.js';

class NetworkUpdateCommand extends NetworkProtocolCommand {
    constructor(ctx) {
        super(ctx);
        this.blockchainModuleManager = ctx.blockchainModuleManager; // can we remove this
        this.ualService = ctx.ualService; // can we remove this

        this.errorType = ERROR_TYPE.UPDATE.UPDATE_NETWORK_START_ERROR;
    }

    /**
     * Builds default networkUpdateCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'networkUpdateCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default NetworkUpdateCommand;
