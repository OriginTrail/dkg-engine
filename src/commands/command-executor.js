import { Queue, Worker } from 'bullmq';
import {
    PERMANENT_COMMANDS,
    DEFAULT_COMMAND_DELAY_IN_MILLS,
    GENERAL_COMMAND_QUEUE_PARALLELISM,
    BATCH_GET_COMMAND_QUEUE_PARALLELISM,
    DEFAULT_COMMAND_PRIORITY,
    MAX_COMMAND_LIFETIME,
} from '../constants/constants.js';

/**
 * Queues and processes commands
 */
class CommandExecutor {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.commandResolver = ctx.commandResolver;
        this.operationIdService = ctx.operationIdService;

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

        this.queueBatchGet = new Queue('batchGetQueue', {
            connection: {
                host: 'localhost',
                port: 6379,
            },
        });

        this.batchGetWorker = new Worker(
            'batchGetQueue',
            async (job) => {
                const commandData = job.data;

                const createdTime = new Date(job.timestamp).getTime();
                const now = Date.now();

                if (now - createdTime > MAX_COMMAND_LIFETIME) {
                    throw new Error('Command is too old');
                }

                this.logger.trace(`Command  started ${job.name}, ${job.id}`);

                const commandName = job.name;

                const handler = this.commandResolver.resolve(commandName);
                if (!handler) {
                    throw new Error(`Command will not be executed ${job.name}, missing handler`);
                }

                await handler.execute({ data: commandData });
            },
            {
                connection: {
                    host: 'localhost',
                    port: 6379,
                },
                maxStalledCount: 0,
                lockDuration: 3 * 60 * 1000,
                stalledInterval: 3 * 60 * 1000,
                concurrency: BATCH_GET_COMMAND_QUEUE_PARALLELISM,
            },
        );

        this.worker = new Worker(
            queueName,
            async (job) => {
                const commandData = job.data;
                const createdTime = new Date(job.timestamp).getTime();
                const now = Date.now();

                if (now - createdTime > MAX_COMMAND_LIFETIME) {
                    throw new Error('Command is too old');
                }

                this.logger.trace(`Command  started ${job.name}, ${job.id}`);
                let commandName = job.name;
                if (job.name.startsWith('paranetSyncCommand')) {
                    commandName = `paranetSyncCommand`;
                }

                const handler = this.commandResolver.resolve(commandName);
                if (!handler) {
                    throw new Error(`Command will not be executed ${job.name}, missing handler`);
                }

                await handler.execute({ data: commandData });
            },
            {
                connection: {
                    host: 'localhost',
                    port: 6379,
                },
                maxStalledCount: 0,
                lockDuration: 3 * 60 * 1000,
                stalledInterval: 3 * 60 * 1000,
                concurrency: GENERAL_COMMAND_QUEUE_PARALLELISM,
            },
        );

        this.worker.on('completed', async (job) => {
            this.logger.trace(
                `Job with ID ${job.id}, ${job.name} has been completed. Duration: ${
                    job.finishedOn - job.timestamp
                }`,
            );
        });

        this.batchGetWorker.on('completed', async (job) => {
            this.logger.trace(
                `BatchGetJob with ID ${job.id}, ${job.name} has been completed. Duration: ${
                    job.finishedOn - job.timestamp
                }`,
            );
        });

        this.worker.on('failed', (job, err) => {
            this.logger.error(
                `Job with ID ${job.id}, ${job.name} has failed with error: ${err.message}, ${err.stack}`,
            );
        });

        this.batchGetWorker.on('failed', (job, err) => {
            this.logger.error(
                `BatchGetJob with ID ${job.id}, ${job.name} has failed with error: ${err.message}, ${err.stack}`,
            );
        });

        this.queue.on('error', (err) => {
            this.logger.error(`Queue error: ${err.message}, ${err.stack}`);
        });

        this.queueBatchGet.on('error', (err) => {
            this.logger.error(`BatchGetQueue error: ${err.message}, ${err.stack}`);
        });

        this.worker.on('error', (err) => {
            this.logger.error(`Worker error: ${err.message}, ${err.stack}`);
        });

        this.batchGetWorker.on('error', (err) => {
            this.logger.error(`BatchGetWorker error: ${err.message}, ${err.stack}`);
        });

        this.queueBatchGet.on('closed', () => {
            this.logger.trace('BatchGetQueue has been closed.');
        });

        this.queue.on('closed', () => {
            this.logger.trace('Queue has been closed.');
        });

        setInterval(async () => {
            const generalQueueCount = await this.queue.count();
            const batchGetQueueCount = await this.queueBatchGet.count();
            this.logger.trace(
                `General queue count: ${generalQueueCount}, Batch get queue count: ${batchGetQueueCount}`,
            );

            this.operationIdService.emitChangeEvent(
                'COMMAND_EXECUTOR_QUEUE_COUNT',
                `command-executor-queue-count-${Date.now()}`,
                null,
                generalQueueCount,
                batchGetQueueCount,
            );
        }, 5 * 60 * 1000);
    }

    /**
     * Initialize executor
     * @returns {Promise<void>}
     */
    async addDefaultCommands() {
        await Promise.all(PERMANENT_COMMANDS.map((command) => this._addDefaultCommand(command)));

        this.logger.trace('Command executor has been initialized...');
    }

    /**
     * Resumes the command executor
     */
    async resumeCommandExecutor() {
        if (this.verboseLoggingEnabled) {
            this.logger.trace('Command executor has been resumed...');
        }
        await this.queue.resume();
        await this.queueBatchGet.resume();
        this.worker.resume();
        this.batchGetWorker.resume();
    }

    /**
     * Pause the command executor queue
     */
    async pauseCommandExecutor() {
        this.logger.trace('Command executor queue has been paused...');
        await this.queue.pause();
        await this.worker.pause();
        await this.queueBatchGet.pause();
        await this.batchGetWorker.pause();
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

        await this.removePeriodicCommand(['paranetSyncCommand']);

        if (['eventListenerCommand', 'shardingTableCheckCommand'].includes(name)) {
            await this.add(handler.default(), 0);
        } else {
            await this.add(handler.default(), DEFAULT_COMMAND_DELAY_IN_MILLS);
        }

        if (this.verboseLoggingEnabled) {
            handler.logger.trace(`Permanent command created.`);
        }
    }

    // TODO: Add function that removes periodic command
    async removePeriodicCommand(commandNames) {
        const periodicCommands = await this.queue.getJobSchedulers();
        // Find if command with this prefix exist in repeatable commands
        const periodicCommandsToRemove = periodicCommands.filter((command) =>
            commandNames.some((name) => command.name.startsWith(name)),
        );
        await Promise.all(
            periodicCommandsToRemove.map((command) => this.queue.removeJobScheduler(command.name)),
        );
    }

    /**
     * Adds single command to queue
     * @param command
     * @param delay
     * @param insert
     */
    async add(addCommand, addDelay) {
        const command = addCommand;

        const delay = addDelay ?? 0;
        const commandPriority = command.priority ?? DEFAULT_COMMAND_PRIORITY;
        const jobOptions = { removeOnComplete: true, removeOnFail: true };
        if (delay > 0) {
            jobOptions.delay = delay;
        }
        jobOptions.priority = commandPriority;
        if (command.period && command.period > 0) {
            await this.queue.upsertJobScheduler(
                command.name,
                { every: command.period },
                { name: command.name, data: command.data, opts: jobOptions },
            );
        } else if (
            command.name.toLowerCase().endsWith('batchgetcommand') ||
            command.name.toLowerCase().endsWith('batchgetrequestcommand')
        ) {
            await this.queueBatchGet.add(command.name, command.data, jobOptions);
        } else {
            await this.queue.add(command.name, command.data, jobOptions);
        }
    }

    async commandExecutorShutdown() {
        await this.worker.close();
        await this.queue.close();
        await this.queueBatchGet.close();
        await this.batchGetWorker.close();
    }
}

export default CommandExecutor;
