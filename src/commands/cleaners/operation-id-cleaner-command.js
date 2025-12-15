import Command from '../command.js';
import {
    BYTES_IN_KILOBYTE,
    OPERATION_ID_FILES_FOR_REMOVAL_MAX_NUMBER,
    OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS,
    OPERATION_ID_MEMORY_CLEANUP_TIME_MILLS,
    OPERATION_ID_STATUS,
    COMMAND_PRIORITY,
} from '../../constants/constants.js';

/**
 * Increases approval for Bidding contract on blockchain
 */
class OperationIdCleanerCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.fileService = ctx.fileService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute() {
        const memoryBytes = this.operationIdService.getOperationIdMemoryCacheSizeBytes();
        const fileBytes = await this.operationIdService.getOperationIdFileCacheSizeBytes();
        const bytesInMegabyte = 1024 * 1024;
        this.logger.debug(
            `Operation cache footprint before cleanup: memory=${(
                memoryBytes / bytesInMegabyte
            ).toFixed(2)}MB, files=${(fileBytes / bytesInMegabyte).toFixed(2)}MB`,
        );

        this.logger.debug('Starting command for removal of expired cache files');
        const timeToBeDeleted = Date.now() - OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS;
        await this.repositoryModuleManager.removeOperationIdRecord(timeToBeDeleted, [
            OPERATION_ID_STATUS.COMPLETED,
            OPERATION_ID_STATUS.FAILED,
        ]);
        let removed = await this.operationIdService.removeExpiredOperationIdMemoryCache(
            OPERATION_ID_MEMORY_CLEANUP_TIME_MILLS,
        );
        if (removed) {
            this.logger.debug(
                `Successfully removed ${
                    removed / BYTES_IN_KILOBYTE
                } Kbs expired cached operation entries from memory`,
            );
        }
        removed = await this.operationIdService.removeExpiredOperationIdFileCache(
            OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS,
            OPERATION_ID_FILES_FOR_REMOVAL_MAX_NUMBER,
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
        this.logger.warn(`Failed to clean operation ids table: error: ${command.message}`);
        return Command.repeat();
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'operationIdCleanerCommand',
            period: OPERATION_ID_MEMORY_CLEANUP_TIME_MILLS,
            data: {},
            transactional: false,
            priority: COMMAND_PRIORITY.LOWEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default OperationIdCleanerCommand;
