import { pino } from 'pino';
import pretty from 'pino-pretty';

/**
 * Class for logging messages.
 */
class Logger {
    /**
     * Create a new logger.
     * @param {string} logLevel - The log level to use for the logger.
     */
    constructor(logLevel = 'trace') {
        this.logLevel = logLevel;
        this.initialize(logLevel, true);
    }

    /**
     * Initialize the logger.
     * @param {string} logLevel - The log level to use for the logger.
     */
    initialize(logLevel) {
        try {
            const stream = pretty({
                colorize: true,
                level: this.logLevel,
                translateTime: 'yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname,Event_name,Operation_name,Id_operation',
                hideObject: true,
                messageFormat: (log, messageKey) => {
                    const { commandId, commandName, operationId } = log;
                    let context = '';
                    if (operationId) context += `{Operation ID: ${operationId}} `;
                    if (commandName) context += `[${commandName}] `;
                    if (commandId) context += `(Command ID: ${commandId}) `;
                    return `${context} ${log[messageKey]}`;
                },
            });
            this.pinoLogger = pino(
                {
                    customLevels: {
                        emit: 15,
                        api: 25,
                    },
                    level: logLevel,
                },
                stream,
            );
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(`Failed to create logger. Error message: ${e.message}`);
        }
    }

    /**
     * Create a child logger with the given bindings.
     * @param {pino.Bindings} bindings - The bindings to use for the child logger.
     * @return {Logger} The child logger.
     */
    child(bindings) {
        // TODO: Might be better not to cast as Logger, but as pino.Logger
        return this.pinoLogger.child(bindings, {});
    }

    /**
     * Restart the logger.
     */
    restart() {
        this.initialize(this.logLevel, true);
    }

    // ===========================
    // ====   LOG LEVELS    ======
    // ===========================

    /**
     * Log a silent message.
     * @param {any} obj - The object to log.
     */
    silent(obj) {
        this.pinoLogger.silent(obj);
    }

    /**
     * Log a fatal message.
     * @param {any} obj - The object to log.
     */
    fatal(obj) {
        this.pinoLogger.fatal(obj);
    }

    /**
     * Log an error message.
     * @param {any} obj - The object to log.
     */
    error(obj) {
        this.pinoLogger.error(obj);
    }

    /**
     * Log a warning message.
     * @param {any} obj - The object to log.
     */
    warn(obj) {
        this.pinoLogger.warn(obj);
    }

    /**
     * Log an info message.
     * @param {any} obj - The object to log.
     */
    info(obj) {
        this.pinoLogger.info(obj);
    }

    /**
     * Log a debug message.
     * @param {any} obj - The object to log.
     */
    debug(obj) {
        this.pinoLogger.debug(obj);
    }

    /**
     * Log an emit message.
     * @param {any} obj - The object to log.
     */
    emit(obj) {
        // TODO: Check if confused with node.js event emitter
        this.pinoLogger.emit(obj);
    }

    /**
     * Log a trace message.
     * @param {any} obj - The object to log.
     */
    trace(obj) {
        this.pinoLogger.trace(obj);
    }

    /**
     * Log an API message.
     * @param {any} obj - The object to log.
     */
    api(obj) {
        this.pinoLogger.api(obj);
    }

    /**
     * Close the logger.
     * @param {string} closingMessage - The message to log when closing the logger.
     */
    closeLogger(closingMessage) {
        const finalLogger = pino.final(this.pinoLogger);
        finalLogger.info(closingMessage);
    }
}

export default Logger;
