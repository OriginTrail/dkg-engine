import {
    FINALIZED_COMMAND_CLEANUP_TIME_MILLS,
    ARCHIVE_COMMANDS_FOLDER,
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

    getArchiveFolderName() {
        return ARCHIVE_COMMANDS_FOLDER;
    }

    async deleteRows(ids) {
        return this.repositoryModuleManager.removeCommands(ids);
    }

    async findAndDeleteRows(nowTimestamp) {
        return this.repositoryModuleManager.removeFinalizedCommands(
            nowTimestamp,
            REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER, );
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
