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
        const nowTimestamp = Date.now();

        let rowsForRemoval = await this.findRowsForRemoval(nowTimestamp);
        const ids = rowsForRemoval.map((command) => command.id);
        await this.deleteRows(ids);

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
