import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    UPDATE_CLEANUP_TIME_DELAY,
    UPDATE_CLEANUP_TIME_MILLS,
} from '../../constants/constants.js';

class UpdateCleanerCommand extends CleanerCommand {
    async deleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationRecords(
            OPERATIONS.UPDATE,
            nowTimestamp - UPDATE_CLEANUP_TIME_DELAY,
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
            name: 'updateCleanerCommand',
            data: {},
            period: UPDATE_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default UpdateCleanerCommand;
