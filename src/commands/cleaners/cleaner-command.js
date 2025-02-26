import { REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER } from '../../constants/constants.js';
import Command from '../command.js';

class CleanerCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.archiveService = ctx.archiveService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute() {
        let deletedRowsCount;

        /* eslint-disable no-await-in-loop */
        do {
            const nowTimestamp = Date.now();
            deletedRowsCount = await this.findAndDeleteRows(nowTimestamp);
        } while (deletedRowsCount === REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER);
        /* eslint-enable no-await-in-loop */

        return Command.repeat();
    }

    getArchiveName(rowsForRemoval) {
        const firstTimestamp = new Date(rowsForRemoval[0].createdAt).getTime();
        const lastTimestamp = new Date(
            rowsForRemoval[rowsForRemoval.length - 1].createdAt,
        ).getTime();
        return `${firstTimestamp}-${lastTimestamp}.json`;
    }

    // eslint-disable-next-line no-unused-vars
    async findAndDeleteRows(nowTimestamp) {
        throw Error('findAndDeleteRows not implemented');
    }

    // eslint-disable-next-line no-unused-vars
    async findRowsForRemoval(nowTimestamp) {
        throw Error('findRowsForRemoval not implemented');
    }

    getArchiveFolderName() {
        throw Error('getArchiveFolderName not implemented');
    }

    // eslint-disable-next-line no-unused-vars
    async deleteRows(ids) {
        throw Error('deleteRows not implemented');
    }

    /**
     * Recover system from failure
     * @param command
     * @param error
     */
    async recover(command) {
        this.logger.warn(`Failed to clean operational db data: error: ${command.message}`);
        return Command.repeat();
    }
}

export default CleanerCommand;
