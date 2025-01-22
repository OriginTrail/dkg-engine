import FindShardCommand from '../../common/find-shard-command.js';
import { OPERATION_ID_STATUS, ERROR_TYPE } from '../../../../constants/constants.js';

class GetFindShardCommand extends FindShardCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.getService;

        this.errorType = ERROR_TYPE.FIND_SHARD.GET_FIND_SHARD_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.GET.GET_FIND_NODES_START;
        this.operationEndEvent = OPERATION_ID_STATUS.GET.GET_FIND_NODES_END;
        this.findShardNodesStartEvent =
            OPERATION_ID_STATUS.GET.GET_FIND_NODES_FIND_SHARD_NODES_START;
        this.findShardNodesEndEvent = OPERATION_ID_STATUS.GET.GET_FIND_NODES_FIND_SHARD_NODES_END;
        this.processFoundNodesStartEvent =
            OPERATION_ID_STATUS.GET.GET_FIND_NODES_PROCESS_FOUND_NODES_START;
        this.processFoundNodesEndEvent =
            OPERATION_ID_STATUS.GET.GET_FIND_NODES_PROCESS_FOUND_NODES_END;
    }

    // eslint-disable-next-line no-unused-vars
    getOperationCommandSequence(nodePartOfShard, commandData) {
        const sequence = ['localGetCommand'];
        sequence.push(
            commandData.paranetNodesAccessPolicy === 'OPEN'
                ? 'networkGetCommand'
                : 'curatedParanetNetworkGetCommand',
        );
        return sequence;
    }

    /**
     * Builds default getFindShardCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'getFindShardCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default GetFindShardCommand;
