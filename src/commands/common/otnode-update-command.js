import semver from 'semver';
import Command from '../command.js';
import { COMMAND_PRIORITY } from '../../constants/constants.js';

class OtnodeUpdateCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.autoUpdaterModuleManager = ctx.autoUpdaterModuleManager;
        this.fileService = ctx.fileService;
    }

    /**
     * Performs code update by fetching new code from github repo
     * @param command
     */
    async execute() {
        if (!this.config.modules.autoUpdater.enabled) {
            return Command.empty();
        }
        try {
            this.logger.info('Checking for new updates...');
            const { upToDate, currentVersion, remoteVersion } =
                await this.autoUpdaterModuleManager.compareVersions();
            if (!upToDate) {
                if (semver.lt(semver.valid(remoteVersion), semver.valid(currentVersion))) {
                    this.logger.info(
                        'Remote version less than current version, update will be skipped',
                    );
                    return Command.repeat();
                }
                const success = await this.autoUpdaterModuleManager.update();

                if (success) {
                    const updateFolderPath = this.fileService.getDataFolderPath();
                    await this.fileService.writeContentsToFile(
                        updateFolderPath,
                        'UPDATED',
                        'UPDATED',
                    );
                    this.logger.info('Node will now restart!');
                    process.exit(1);
                }
                this.logger.info('Unable to update ot-node to new version.');
            } else {
                this.logger.info('Your node is running on the latest version!');
            }
        } catch (error) {
            await this.handleError(error.message);
        }
        return Command.repeat();
    }

    async recover(command) {
        await this.handleError(command.message);

        return Command.repeat();
    }

    async handleError(errorMessage) {
        this.logger.error(`Error in update command: ${errorMessage}`);
    }

    /**
     * Builds default otnodeUpdateCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'otnodeUpdateCommand',
            delay: 0,
            period: 15 * 60 * 1000,
            transactional: false,
            priority: COMMAND_PRIORITY.HIGH,
        };
        Object.assign(command, map);
        return command;
    }
}

export default OtnodeUpdateCommand;
