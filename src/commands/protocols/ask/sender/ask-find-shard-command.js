import FindShardCommand from '../../common/find-shard-command.js';
import { ERROR_TYPE, OPERATION_ID_STATUS } from '../../../../constants/constants.js';

class AskFindShardCommand extends FindShardCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.askService;

        this.errorType = ERROR_TYPE.FIND_SHARD.ASK_FIND_SHARD_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.ASK.ASK_FIND_NODES_START;
        this.operationEndEvent = OPERATION_ID_STATUS.ASK.ASK_FIND_NODES_END;
    }

    // eslint-disable-next-line no-unused-vars
    getOperationCommandSequence(nodePartOfShard, commandData) {
        return [];
    }

    /**
     * Builds default askFindShardCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'askFindShardCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default AskFindShardCommand;
