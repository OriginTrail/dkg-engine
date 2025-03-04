import CleanerCommand from './cleaner-command.js';
import {
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
    OPERATIONS,
    FINALITY_CLEANUP_TIME_DELAY,
    FINALITY_CLEANUP_TIME_MILLS,
} from '../../constants/constants.js';

class FinalityCleanerCommand extends CleanerCommand {
    async findRowsForRemoval(nowTimestamp) {
        return this.repositoryModuleManager.findProcessedOperations(
            OPERATIONS.FINALITY,
            nowTimestamp - FINALITY_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveProcessedOperationRecords(
            OPERATIONS.FINALITY,
            nowTimestamp - FINALITY_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeOperationRecords(OPERATIONS.FINALITY, ids);
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'finalityCleanerCommand',
            data: {},
            period: FINALITY_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default FinalityCleanerCommand;
