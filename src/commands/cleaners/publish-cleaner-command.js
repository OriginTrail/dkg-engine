import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    PUBLISH_CLEANUP_TIME_DELAY,
    PUBLISH_CLEANUP_TIME_MILLS,
    COMMAND_PRIORITY,
} from '../../constants/constants.js';

class PublishCleanerCommand extends CleanerCommand {
    async deleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationRecords(
            OPERATIONS.PUBLISH,
            nowTimestamp - PUBLISH_CLEANUP_TIME_DELAY,
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
            name: 'publishCleanerCommand',
            data: {},
            period: PUBLISH_CLEANUP_TIME_MILLS,
            transactional: false,
            priority: COMMAND_PRIORITY.LOWEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishCleanerCommand;
