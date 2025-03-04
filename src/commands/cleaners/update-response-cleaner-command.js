import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    UPDATE_RESPONSE_CLEANUP_TIME_DELAY,
    UPDATE_RESPONSE_CLEANUP_TIME_MILLS,
    ARCHIVE_UPDATE_RESPONSES_FOLDER,
} from '../../constants/constants.js';

class UpdateResponseCleanerCommand extends CleanerCommand {
    async findRowsForRemoval(nowTimestamp) {
        return this.repositoryModuleManager.findProcessedOperationResponse(
            nowTimestamp - UPDATE_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
            OPERATIONS.UPDATE,
        );
    }

    getArchiveFolderName() {
        return ARCHIVE_UPDATE_RESPONSES_FOLDER;
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationResponse(
            OPERATIONS.UPDATE,
            nowTimestamp - UPDATE_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeOperationResponse(ids, OPERATIONS.UPDATE);
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'updateResponseCleanerCommand',
            data: {},
            period: UPDATE_RESPONSE_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default UpdateResponseCleanerCommand;
