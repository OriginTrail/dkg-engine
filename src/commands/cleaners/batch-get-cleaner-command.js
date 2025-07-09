import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    GET_CLEANUP_TIME_DELAY,
    GET_CLEANUP_TIME_MILLS,
    COMMAND_PRIORITY,
} from '../../constants/constants.js';

class BatchGetCleanerCommand extends CleanerCommand {
    async deleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationRecords(
            OPERATIONS.BATCH_GET,
            nowTimestamp - GET_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'batchGetCleanerCommand',
            data: {},
            period: GET_CLEANUP_TIME_MILLS,
            transactional: false,
            priority: COMMAND_PRIORITY.LOWEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default BatchGetCleanerCommand;
