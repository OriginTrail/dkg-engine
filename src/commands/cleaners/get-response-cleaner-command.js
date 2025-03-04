import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    GET_RESPONSE_CLEANUP_TIME_DELAY,
    GET_RESPONSE_CLEANUP_TIME_MILLS,
    ARCHIVE_GET_RESPONSES_FOLDER,
} from '../../constants/constants.js';

class GetResponseCleanerCommand extends CleanerCommand {
    async findRowsForRemoval(nowTimestamp) {
        return this.repositoryModuleManager.findProcessedOperationResponse(
            nowTimestamp - GET_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
            OPERATIONS.GET,
        );
    }

    getArchiveFolderName() {
        return ARCHIVE_GET_RESPONSES_FOLDER;
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationResponse(
            OPERATIONS.GET,
            nowTimestamp - GET_RESPONSE_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeOperationResponse(ids, OPERATIONS.GET);
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'getResponseCleanerCommand',
            data: {},
            period: GET_RESPONSE_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default GetResponseCleanerCommand;
