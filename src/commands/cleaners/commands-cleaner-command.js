import {
    FINALIZED_COMMAND_CLEANUP_TIME_MILLS,
    FINALIZED_COMMAND_CLEANUP_TIME_DELAY,
    REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
} from '../../constants/constants.js';
import CleanerCommand from './cleaner-command.js';

class CommandsCleanerCommand extends CleanerCommand {
    async findRowsForRemoval(nowTimestamp) {
        return this.repositoryModuleManager.findFinalizedCommands(
            nowTimestamp,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.findAndRemoveFinalizedCommands(
            nowTimestamp - FINALIZED_COMMAND_CLEANUP_TIME_DELAY,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER,
        );
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeCommands(ids);
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'commandsCleanerCommand',
            data: {},
            period: FINALIZED_COMMAND_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default CommandsCleanerCommand;
