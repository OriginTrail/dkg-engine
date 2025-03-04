import { REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER } from '../../constants/constants.js';
import Command from '../command.js';

class CleanerCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.repositoryModuleManager = ctx.repositoryModuleManager;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute() {
        let deletedRowsCount;

        do {
            const nowTimestamp = Date.now();
            // eslint-disable-next-line no-await-in-loop
            deletedRowsCount = await this.findAndDeleteRows(nowTimestamp);
        } while (deletedRowsCount === REPOSITORY_ROWS_FOR_REMOVAL_MAX_NUMBER);

        return Command.repeat();
    }

    // eslint-disable-next-line no-unused-vars
    async findRowsForRemoval(nowTimestamp) {
        throw Error('findRowsForRemoval not implemented');
    }

    // eslint-disable-next-line no-unused-vars
    async findAndDeleteRows(nowTimestamp) {
        throw Error('findAndDeleteRows not implemented');
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
