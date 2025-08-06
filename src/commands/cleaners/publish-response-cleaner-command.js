import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    PUBLISH_RESPONSE_CLEANUP_TIME_DELAY,
    PUBLISH_RESPONSE_CLEANUP_TIME_MILLS,
    COMMAND_PRIORITY,
} from '../../constants/constants.js';

class PublishResponseCleanerCommand extends CleanerCommand {
    async deleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationResponse(
            OPERATIONS.PUBLISH,
            nowTimestamp - PUBLISH_RESPONSE_CLEANUP_TIME_DELAY,
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
            name: 'publishResponseCleanerCommand',
            data: {},
            period: PUBLISH_RESPONSE_CLEANUP_TIME_MILLS,
            transactional: false,
            priority: COMMAND_PRIORITY.LOWEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishResponseCleanerCommand;
