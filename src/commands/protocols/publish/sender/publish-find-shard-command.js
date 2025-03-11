import FindShardCommand from '../../common/find-shard-command.js';
import { OPERATION_ID_STATUS, ERROR_TYPE } from '../../../../constants/constants.js';

class PublishFindShardCommand extends FindShardCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.publishService;
        this.errorType = ERROR_TYPE.FIND_SHARD.PUBLISH_FIND_SHARD_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.PUBLISH.PUBLISH_FIND_NODES_START;
        this.operationEndEvent = OPERATION_ID_STATUS.PUBLISH.PUBLISH_FIND_NODES_END;
    }

    getOperationCommandSequence(nodePartOfShard, commandData) {
        const sequence = [];
        if (!commandData.isOperationV0) {
            sequence.push('publishValidateAssetCommand');
        }

        if (!commandData.isOperationV0) {
            sequence.push('localStoreCommand');
        } else {
            sequence.push('networkPublishCommand');
        }

        return sequence;
    }

    /**
     * Builds default publishFindShardCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'publishFindShardCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishFindShardCommand;
