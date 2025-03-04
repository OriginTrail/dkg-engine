import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    ASK_RESPONSE_CLEANUP_TIME_DELAY,
    ASK_RESPONSE_CLEANUP_TIME_MILLS,
    ARCHIVE_ASK_RESPONSES_FOLDER,
} from '../../constants/constants.js';

class AskResponseCleanerCommand extends CleanerCommand {
    async findRowsForRemoval(nowTimestamp) {
        return this.repositoryModuleManager.findProcessedOperationResponse(
            nowTimestamp - ASK_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
            OPERATIONS.ASK,
        );
    }

    getArchiveFolderName() {
        return ARCHIVE_ASK_RESPONSES_FOLDER;
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationResponse(
            OPERATIONS.ASK,
            nowTimestamp - ASK_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeOperationResponse(ids, OPERATIONS.ASK);
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'askResponseCleanerCommand',
            data: {},
            period: ASK_RESPONSE_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default AskResponseCleanerCommand;
