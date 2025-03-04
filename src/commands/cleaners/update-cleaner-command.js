import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    UPDATE_CLEANUP_TIME_DELAY,
    UPDATE_CLEANUP_TIME_MILLS,
    ARCHIVE_UPDATE_FOLDER,
} from '../../constants/constants.js';

class UpdateCleanerCommand extends CleanerCommand {
    async findRowsForRemoval(nowTimestamp) {
        return this.repositoryModuleManager.findProcessedOperations(
            OPERATIONS.UPDATE,
            nowTimestamp - UPDATE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    getArchiveFolderName() {
        return ARCHIVE_UPDATE_FOLDER;
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationRecords(
            OPERATIONS.UPDATE,
            nowTimestamp - UPDATE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeOperationRecords(OPERATIONS.UPDATE, ids);
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
            period: UPDATE_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default UpdateCleanerCommand;
