import { Queue, Worker } from 'bullmq';
import {
    PERMANENT_COMMANDS,
    DEFAULT_COMMAND_DELAY_IN_MILLS,
    COMMAND_QUEUE_PARALLELISM,
    DEFAULT_COMMAND_PRIORITY,
} from '../constants/constants.js';

/**
 * Queues and processes commands
 */
class CommandExecutor {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.commandResolver = ctx.commandResolver;

        this.verboseLoggingEnabled = ctx.config.commandExecutorVerboseLoggingEnabled;
        const env = process.env.NODE_ENV;
        const queueName =
            env === 'development'
                ? `command-executor-${ctx.config.modules.blockchain.implementation['hardhat1:31337'].config.nodeName}`
                : 'command-executor';
        this.queue = new Queue(queueName, {
            connection: {
                host: 'localhost',
                port: 6379,
            },
        });
        this.worker = new Worker(
            queueName,
            async (job) => {
                const commandData = job.data;
                if (this.verboseLoggingEnabled) {
                    // Add command name to the log
                    this.logger.trace(`Command  started ${job.name}`);
                }

                const handler = this.commandResolver.resolve(job.name);

                if (!handler) {
                    if (this.verboseLoggingEnabled) {
                        // Add command name to the log
                        this.logger.warn(`Command will not be executed ${job.name}`);
                    }
                    return;
                }

                await handler.execute({ data: commandData });
            },
            {
                connection: {
                    host: 'localhost',
                    port: 6379,
                },
                concurrency: COMMAND_QUEUE_PARALLELISM,
            },
        );

        this.worker.on('completed', async (job) => {
            this.logger.trace(`Job with ID ${job.id}, ${job.name} has been completed.`);
        });

        this.worker.on('failed', (job, err) => {
            this.logger.error(
                `Job with ID ${job.id}, ${job.name} has failed with error: ${err.message}, ${err.stack}`,
            );
        });
    }

    /**
     * Initialize executor
     * @returns {Promise<void>}
     */
    async addDefaultCommands() {
        await Promise.all(PERMANENT_COMMANDS.map((command) => this._addDefaultCommand(command)));

        if (this.verboseLoggingEnabled) {
            this.logger.trace('Command executor has been initialized...');
        }
    }

    /**
     * Resumes the command executor
     */
    async resumeCommandExecutor() {
        if (this.verboseLoggingEnabled) {
            this.logger.trace('Command executor has been resumed...');
        }
        await this.queue.resume();
        this.worker.resume();
    }

    /**
     * Pause the command executor queue
     */
    async pauseCommandExecutor() {
        if (this.verboseLoggingEnabled) {
            this.logger.trace('Command executor queue has been paused...');
        }
        await this.queue.pause();
        await this.worker.pause();
    }

    /**
     * Starts the default command by name
     * @param name - Command name
     * @return {Promise<void>}
     * @private
     */
    async _addDefaultCommand(name) {
        const handler = this.commandResolver.resolve(name);

        if (!handler) {
            // Add command name to the log
            this.logger.warn(`Command will not be executed.`);
            return;
        }

        if (['eventListenerCommand', 'shardingTableCheckCommand'].includes(name)) {
            await this.add(handler.default(), 0, true);
        } else {
            await this.add(handler.default(), DEFAULT_COMMAND_DELAY_IN_MILLS, true);
        }

        if (this.verboseLoggingEnabled) {
            handler.logger.trace(`Permanent command created.`);
        }
    }

    /**
     * Adds single command to queue
     * @param command
     * @param delay
     * @param insert
     */
    async add(addCommand, addDelay) {
        const command = addCommand;

        // if (handler.isBlocking) {
        //     // TODO: Add deduplication for commands that need that using jobID
        //     // Check the db to see if there are unfinalized instances of the same command
        //     const unfinalizedBlockingCommands =
        //         await this.repositoryModuleManager.findUnfinalizedCommandsByName(command.name);

        //     for (const unfinalizedCommand of unfinalizedBlockingCommands) {
        //         if (command.id && command.id === unfinalizedCommand.id) {
        //             if (insert) {
        //                 this.logger.warn(`Inserting duplicate of command ${command.id}!`);
        //             }
        //             continue;
        //         }

        //         if (JSON.stringify(unfinalizedCommand.data) === JSON.stringify(command.data)) {
        //             this.logger.info(
        //                 `Skipping blocking command: ${command.name} because of unfinalized instance of this command with id: ${unfinalizedCommand.id}`,
        //             );
        //             return;
        //         }
        //     }
        // }

        const delay = addDelay ?? 0;
        const commandPriority = command.priority ?? DEFAULT_COMMAND_PRIORITY;
        const jobOptions = {};
        if (delay > 0) {
            jobOptions.delay = delay;
        }
        jobOptions.priority = commandPriority;
        // Add ttl
        if (command.period && command.period > 0) {
            await this.queue.upsertJobScheduler(
                command.name,
                { every: command.period },
                { name: command.name, data: command.data },
            );
        } else {
            await this.queue.add(command.name, command.data, jobOptions);
        }
    }
}

export default CommandExecutor;
