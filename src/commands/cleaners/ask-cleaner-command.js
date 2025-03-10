import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    ASK_CLEANUP_TIME_DELAY,
    ASK_CLEANUP_TIME_MILLS,
} from '../../constants/constants.js';

class AskCleanerCommand extends CleanerCommand {
    async deleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationRecords(
            OPERATIONS.ASK,
            nowTimestamp - ASK_CLEANUP_TIME_DELAY,
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
            name: 'askCleanerCommand',
            data: {},
            period: ASK_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default AskCleanerCommand;
