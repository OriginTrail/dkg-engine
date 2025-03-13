import FindShardCommand from '../../common/find-shard-command.js';
import { OPERATION_ID_STATUS, ERROR_TYPE } from '../../../../constants/constants.js';

class UpdateFindShardCommand extends FindShardCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.upateService;
        this.errorType = ERROR_TYPE.FIND_SHARD.UPDATE_FIND_SHARD_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.UPDATE.UPDATE_FIND_NODES_START;
        this.operationEndEvent = OPERATION_ID_STATUS.UPDATE.UPDATE_FIND_NODES_END;
    }

    getOperationCommandSequence(nodePartOfShard) {
        const sequence = [];
        sequence.push('updateValidateAssetCommand');
        if (nodePartOfShard) {
            sequence.push('localUpdateCommand');
        }
        sequence.push('networkUpdateCommand');

        return sequence;
    }

    /**
     * Builds default updateFindShardCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'updateFindShardCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default UpdateFindShardCommand;
