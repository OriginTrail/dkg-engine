import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    FINALITY_RESPONSE_CLEANUP_TIME_DELAY,
    FINALITY_RESPONSE_CLEANUP_TIME_MILLS,
} from '../../constants/constants.js';

class FinalityResponseCleanerCommand extends CleanerCommand {
    async deleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationResponse(
            OPERATIONS.FINALITY,
            nowTimestamp - FINALITY_RESPONSE_CLEANUP_TIME_DELAY,
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
            name: 'finalityResponseCleanerCommand',
            data: {},
            period: FINALITY_RESPONSE_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default FinalityResponseCleanerCommand;
