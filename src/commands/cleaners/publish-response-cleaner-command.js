import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    PUBLISH_RESPONSE_CLEANUP_TIME_DELAY,
    PUBLISH_RESPONSE_CLEANUP_TIME_MILLS,
    ARCHIVE_PUBLISH_RESPONSES_FOLDER,
} from '../../constants/constants.js';

class PublishResponseCleanerCommand extends CleanerCommand {
    async findRowsForRemoval(nowTimestamp) {
        return this.repositoryModuleManager.findProcessedOperationResponse(
            nowTimestamp - PUBLISH_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
            OPERATIONS.PUBLISH,
        );
    }

    getArchiveFolderName() {
        return ARCHIVE_PUBLISH_RESPONSES_FOLDER;
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationResponse(
            OPERATIONS.PUBLISH,
            nowTimestamp - PUBLISH_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeOperationResponse(ids, OPERATIONS.PUBLISH);
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
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishResponseCleanerCommand;
