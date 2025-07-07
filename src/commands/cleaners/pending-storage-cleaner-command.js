import Command from '../command.js';
import {
    PUBLISH_STORAGE_MEMORY_CLEANUP_COMMAND_CLEANUP_TIME_MILLS,
    PUBLISH_STORAGE_FILE_CLEANUP_COMMAND_CLEANUP_TIME_MILLS,
    PENDING_STORAGE_FILES_FOR_REMOVAL_MAX_NUMBER,
    COMMAND_PRIORITY,
} from '../../constants/constants.js';

/**
 * Cleans memory cache in the pending storage service
 */
class PendingStorageCleanerCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.pendingStorageService = ctx.pendingStorageService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute() {
        this.logger.debug('Starting command for removal of expired pending storage entries');

        const removed = await this.pendingStorageService.removeExpiredFileCache(
            PUBLISH_STORAGE_FILE_CLEANUP_COMMAND_CLEANUP_TIME_MILLS,
            PENDING_STORAGE_FILES_FOR_REMOVAL_MAX_NUMBER,
        );
        if (removed) {
            this.logger.debug(`Successfully removed ${removed} expired cached operation files`);
        }

        return Command.repeat();
    }

    /**
     * Recover system from failure
     * @param command
     * @param error
     */
    async recover(command) {
        this.logger.warn(`Failed to clean pending storage: error: ${command.message}`);
        return Command.repeat();
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'pendingStorageCleanerCommand',
            period: PUBLISH_STORAGE_MEMORY_CLEANUP_COMMAND_CLEANUP_TIME_MILLS,
            data: {},
            transactional: false,
            priority: COMMAND_PRIORITY.LOWEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PendingStorageCleanerCommand;
