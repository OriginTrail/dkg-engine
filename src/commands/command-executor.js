import async from 'async';
import { trace } from '@opentelemetry/api';
import Command from './command.js';
import {
    PERMANENT_COMMANDS,
    MAX_COMMAND_DELAY_IN_MILLS,
    DEFAULT_COMMAND_REPEAT_INTERVAL_IN_MILLS,
    COMMAND_STATUS,
    DEFAULT_COMMAND_DELAY_IN_MILLS,
    COMMAND_QUEUE_PARALLELISM,
} from '../constants/constants.js';

/**
 * Queues and processes commands
 */
class CommandExecutor {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.commandResolver = ctx.commandResolver;
        this.tracer = trace.getTracer('otnode');
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.verboseLoggingEnabled = ctx.config.commandExecutorVerboseLoggingEnabled;

        this.queue = async.queue((command, callback = () => {}) => {
            this.tracer.startActiveSpan(
                `command - ${command.name}`,
                {
                    attributes: {
                        'command.name': command.name,
                        'command.id': command.id,
                        'command.ready_at': command.readyAt,
                        'command.delay': command.delay,
                        'command.period': command.period,
                        'command.transactional': command.transactional,
                        'command.operation.id': command.data?.operationId,
                    },
                },
                (span) =>
                    this._execute(command)
                        .then((result) => {
                            callback(result);
                            span.end();
                        })
                        .catch((error) => {
                            span.recordException(error);
                            span.end();
                            this.logger.error(
                                `Something went really wrong! OT-node shutting down... ${error}`,
                            );
                            process.exit(1);
                        }),
            );
        }, COMMAND_QUEUE_PARALLELISM);
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
     * Resumes the command executor queue
     */
    resumeQueue() {
        if (this.verboseLoggingEnabled) {
            this.logger.trace('Command executor queue has been resumed...');
        }
        this.queue.resume();
    }

    /**
     * Pause the command executor queue
     */
    pauseQueue() {
        if (this.verboseLoggingEnabled) {
            this.logger.trace('Command executor queue has been paused...');
        }
        this.queue.pause();
    }

    /**
     * Executes commands
     * @param command Command
     */
    async _execute(executeCommand) {
        const command = executeCommand;
        const now = Date.now();
        await this._update(command, {
            startedAt: now,
        });

        const commandContext = {
            commandId: command.id,
            commandName: command.name,
        };
        if (command.data && command.data.operationId) {
            commandContext.operationId = command.data.operationId;
        }
        const loggerWithContext = this.logger.child(commandContext);

        if (this.verboseLoggingEnabled) {
            loggerWithContext.trace('Command started.');
        }

        const handler = this.commandResolver.resolve(command.name);
        handler.logger = loggerWithContext;

        for (const key in handler) {
            if (key.endsWith('Service') || key.endsWith('ModuleManager')) {
                handler[key].logger = loggerWithContext;
            }
        }

        if (!handler) {
            loggerWithContext.warn('Command will not be executed.');
            await this._update(command, {
                status: COMMAND_STATUS.UNKNOWN,
            });
            return;
        }
        if (command.deadlineAt && now > command.deadlineAt) {
            loggerWithContext.warn('Command is too late...');
            await this._update(command, {
                status: COMMAND_STATUS.EXPIRED,
            });
            try {
                const result = await handler.expired(command);
                if (result?.commands) {
                    await Promise.all(result.commands.map((c) => this.add(c, c.delay, true)));
                }
            } catch (e) {
                loggerWithContext.warn('Failed to handle expired callback');
            }
            return;
        }

        const waitMs = command.readyAt + command.delay - now;
        if (waitMs > 0) {
            if (this.verboseLoggingEnabled) {
                loggerWithContext.trace('Command should be delayed');
            }
            await this.add(command, Math.min(waitMs, MAX_COMMAND_DELAY_IN_MILLS), false);
            return;
        }

        try {
            const processResult = await this._process(async (transaction) => {
                await this._update(
                    command,
                    {
                        status: COMMAND_STATUS.STARTED,
                    },
                    transaction,
                );

                command.data = handler.unpack(command.data);

                let result = await handler.execute(command, transaction);
                if (result.repeat) {
                    await this._update(
                        command,
                        {
                            status: COMMAND_STATUS.REPEATING,
                        },
                        transaction,
                    );

                    command.data = handler.pack(command.data);

                    const period = command.period ?? DEFAULT_COMMAND_REPEAT_INTERVAL_IN_MILLS;
                    await this.add(command, period, false);
                    return Command.repeat();
                }

                if (result.retry) {
                    result = await this._handleRetry(command, handler);
                    if (result.retry) {
                        return result;
                    }
                }

                const children = result.commands.map((c) => {
                    const newCommand = c;
                    newCommand.parentId = command.id;
                    return newCommand;
                });

                await Promise.all(children.map((e) => this._insert(e, transaction)));
                await this._update(
                    command,
                    {
                        status: COMMAND_STATUS.COMPLETED,
                    },
                    transaction,
                );
                return {
                    children,
                };
            }, command.transactional);

            if (!processResult.repeat && !processResult.retry) {
                if (this.verboseLoggingEnabled) {
                    loggerWithContext.trace(`Command processed.`);
                }
                const addPromises = [];
                processResult.children.forEach((e) =>
                    addPromises.push(this.add(e, e.delay, false)),
                );
                await Promise.all(addPromises);
            }
        } catch (e) {
            if (this.verboseLoggingEnabled) {
                loggerWithContext.trace(`Failed to process command. ${e}.\n${e.stack}`);
            }

            try {
                const result = await this._handleError(command, handler, e);
                if (result && result.repeat) {
                    await this._update(command, {
                        status: COMMAND_STATUS.REPEATING,
                    });

                    command.data = handler.pack(command.data);

                    const period = command.period
                        ? command.period
                        : DEFAULT_COMMAND_REPEAT_INTERVAL_IN_MILLS;
                    await this.add(command, period, false);
                    return Command.repeat();
                }
            } catch (error) {
                loggerWithContext.warn(`Failed to handle error callback, error: ${error.message}`);
            }
        }
    }

    /**
     * Process command using transaction or not
     * @param execFn
     * @param transactional
     * @returns {Promise<*>}
     * @private
     */
    async _process(execFn, transactional) {
        if (transactional) {
            return this.repositoryModuleManager.transaction(execFn);
        }
        return execFn(null);
    }

    /**
     * Starts the default command by name
     * @param name - Command name
     * @return {Promise<void>}
     * @private
     */
    async _addDefaultCommand(name) {
        await this.delete(name);

        const commandContext = {
            commandName: name,
        };
        const loggerWithContext = this.logger.child(commandContext);

        const handler = this.commandResolver.resolve(name);
        handler.logger = loggerWithContext;

        for (const key in handler) {
            if (key.endsWith('Service') || key.endsWith('ModuleManager')) {
                handler[key].logger = loggerWithContext;
            }
        }

        if (!handler) {
            handler.logger.warn(`Command will not be executed.`);
            return;
        }
        await this.add(handler.default(), DEFAULT_COMMAND_DELAY_IN_MILLS, true);
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
    async add(addCommand, addDelay, insert = true) {
        let command = addCommand;
        let delay = addDelay ?? 0;

        if (delay > MAX_COMMAND_DELAY_IN_MILLS) {
            if (command.readyAt == null) {
                command.readyAt = Date.now();
            }
            command.readyAt += delay;
            delay = MAX_COMMAND_DELAY_IN_MILLS;
        }

        if (insert) {
            command = await this._insert(command);
        }
        if (delay) {
            setTimeout(
                (timeoutCommand) => {
                    this.queue.push(timeoutCommand);
                },
                delay,
                command,
            );
        } else {
            this.queue.push(command);
        }
    }

    /**
     * Handles command retry
     * @param command
     * @param handler
     * @private
     */
    async _handleRetry(retryCommand, handler) {
        const command = retryCommand;
        if (command.retries > 1) {
            command.data = handler.pack(command.data);
            await this._update(command, {
                status: COMMAND_STATUS.PENDING,
                data: command.data,
                retries: command.retries - 1,
                message: command.message,
            });
            const period = command.period ?? 0;
            const delay = command.delay ?? 0;
            await this.add(command, period + delay, false);
            return Command.retry();
        }
        await handler.retryFinished(command);
        return Command.empty();
    }

    /**
     * Handles command error
     * @param command
     * @param handler
     * @param err
     * @return {Promise<void>}
     * @private
     */
    async _handleError(command, handler, error) {
        if (command.retries > 0) {
            await this._update(command, {
                retries: command.retries - 1,
            });
            const period = command.period ?? 0;
            const delay = command.delay ?? 0;
            await this.add(command, period + delay, false);
        } else {
            try {
                await this._update(command, {
                    status: COMMAND_STATUS.FAILED,
                    message: error.message,
                });
                handler.logger.warn(`Error in command: ${command.name}, error: ${error.message}`);
                return await handler.recover(command);
            } catch (e) {
                handler.logger.warn(
                    `Failed to recover command ${command.name} and ID ${command.id}`,
                );
            }
        }
    }

    /**
     * Inserts command in the db
     * @param command
     * @param transaction
     * @return {Promise<void>}
     * @private
     */
    async _insert(insertCommand, transaction = null) {
        const command = insertCommand;
        if (!command.name) {
            [command.name] = command.sequence;
            command.sequence = command.sequence.slice(1);
        }
        if (!command.readyAt) {
            command.readyAt = Date.now(); // take current time
        }
        if (command.delay == null) {
            command.delay = 0;
        }
        if (!command.transactional) {
            command.transactional = 0;
        }
        if (!command.data) {
            const commandInstance = this.commandResolver.resolve(command.name);
            if (commandInstance) {
                command.data = commandInstance.pack(command.data);
            }
        }
        command.status = COMMAND_STATUS.PENDING;
        const opts = {};
        if (transaction != null) {
            opts.transaction = transaction;
        }
        const model = await this.repositoryModuleManager.createCommand(command, opts);
        command.id = model.id;
        return command;
    }

    /**
     * Delete command from database
     * @param name
     * @returns {Promise<void>}
     */
    async delete(name) {
        await this.repositoryModuleManager.destroyCommand(name);
    }

    /**
     * Updates command in the db
     * @param command
     * @param update
     * @param transaction
     * @return {Promise<void>}
     * @private
     */
    async _update(command, update, transaction = null) {
        Object.assign(command, update);
        const opts = {
            returning: true,
            where: {
                id: command.id,
            },
        };
        if (transaction) {
            opts.transaction = transaction;
        }
        await this.repositoryModuleManager.updateCommand(update, opts);
    }

    /**
     * Replays pending commands from the database
     * @returns {Promise<void>}
     */
    async replayOldCommands() {
        this.logger.info('Replay pending/started commands from the database...');
        const pendingCommands = await this.repositoryModuleManager.getCommandsWithStatus(
            [COMMAND_STATUS.PENDING, COMMAND_STATUS.STARTED, COMMAND_STATUS.REPEATING],
            PERMANENT_COMMANDS,
        );

        const commands = [];
        for (const command of pendingCommands) {
            if (!command?.parentId) {
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const parent = await this.repositoryModuleManager.getCommandWithId(command.parentId);
            if (parent && parent.status !== 'COMPLETED') {
                continue;
            }
            commands.push(command);
        }

        const adds = [];
        for (const commandModel of commands) {
            const queued = this.queue.workersList().find((e) => e.data.id === commandModel.id);
            if (!queued) {
                const command = {
                    id: commandModel.id,
                    name: commandModel.name,
                    data: commandModel.data,
                    readyAt: commandModel.readyAt,
                    delay: commandModel.delay,
                    startedAt: commandModel.startedAt,
                    deadlineAt: commandModel.deadlineAt,
                    period: commandModel.period,
                    status: commandModel.status,
                    message: commandModel.message,
                    parentId: commandModel.parentId,
                    transactional: commandModel.transactional,
                    retries: commandModel.retries,
                    sequence: commandModel.sequence,
                };
                adds.push(this.add(command, 0, false));
            }
        }

        await Promise.all(adds);
    }
}

export default CommandExecutor;
