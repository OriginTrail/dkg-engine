/* eslint-disable no-console */
import 'dotenv/config';
import fs from 'fs-extra';
import OTNode from './ot-node.js';

import { NODE_ENVIRONMENTS } from './src/constants/constants.js';

process.env.NODE_ENV =
    process.env.NODE_ENV && Object.values(NODE_ENVIRONMENTS).includes(process.env.NODE_ENV)
        ? process.env.NODE_ENV
        : NODE_ENVIRONMENTS.DEVELOPMENT;

// Only run the main function if this module is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        let userConfig = null;
        try {
            if (
                process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT &&
                process.argv.length === 3
            ) {
                const configurationFilename = process.argv[2];
                userConfig = JSON.parse(await fs.promises.readFile(process.argv[2]));
                userConfig.configFilename = configurationFilename;
            }
        } catch (error) {
            console.log('Unable to read user configuration from file: ', process.argv[2]);
            process.exit(1);
        }
        try {
            const node = new OTNode(userConfig);
            await node.start();
        } catch (e) {
            console.error(`Error occurred while start ot-node, error message: ${e}. ${e.stack}`);
            // console.error(`Trying to recover from older version`);
            // if (process.env.NODE_ENV !== NODE_ENVIRONMENTS.DEVELOPMENT) {
            //     const rootPath = path.join(appRootPath.path, '..');
            //     const oldVersionsDirs = (await fs.promises.readdir(rootPath, { withFileTypes: true }))
            //         .filter((dirent) => dirent.isDirectory())
            //         .map((dirent) => dirent.name)
            //         .filter((name) => semver.valid(name) && !appRootPath.path.includes(name));
            //
            //     if (oldVersionsDirs.length === 0) {
            //         console.error(
            //             `Failed to start OT-Node, no backup code available. Error message: ${e.message}`,
            //         );
            //         process.exit(1);
            //     }
            //
            //     const oldVersion = oldVersionsDirs.sort(semver.compare).pop();
            //     const oldversionPath = path.join(rootPath, oldVersion);
            //     execSync(`ln -sfn ${oldversionPath} ${rootPath}/current`);
            //     await fs.promises.rm(appRootPath.path, { force: true, recursive: true });
            // }
            process.exit(1);
        }
    })();
}

process.on('unhandledRejection', (err) => {
    // Handle specific libp2p peer lookup failures that escape try-catch blocks
    if (err && err.code === 'ERR_LOOKUP_FAILED') {
        console.warn(`Peer lookup failed (ERR_LOOKUP_FAILED): ${err.message}`);
        return; // Don't crash for peer lookup failures
    }

    // Handle ECONNRESET errors gracefully - these are common network issues
    if (err && (err.code === 'ECONNRESET' || err.errno === -104)) {
        console.warn(`Network connection reset (ECONNRESET): ${err.message}`);
        return; // Don't crash for connection reset errors
    }

    // Handle ERR_UNSUPPORTED_PROTOCOL errors gracefully
    if (err && err.code === 'ERR_UNSUPPORTED_PROTOCOL') {
        console.warn(`Unsupported protocol error (ERR_UNSUPPORTED_PROTOCOL): ${err.message}`);
        return; // Don't crash for protocol errors
    }

    // Handle EPIPE (broken pipe) errors gracefully
    if (err && (err.code === 'EPIPE' || err.errno === -32)) {
        console.warn(`Broken pipe error (EPIPE): ${err.message}`);
        return; // Don't crash for broken pipe errors
    }

    // Handle ETIMEDOUT errors gracefully - these are common database connection timeouts
    if (err && (err.code === 'ETIMEDOUT' || err.errno === -110)) {
        console.warn(`Connection timeout error (ETIMEDOUT): ${err.message}`);
        return; // Don't crash for timeout errors
    }

    // Handle Sequelize "Got timeout reading communication packets" errors gracefully
    if (err && err.message && err.message.includes('Got timeout reading communication packets')) {
        console.warn(`Sequelize communication timeout error: ${err.message}`);
        return; // Don't crash for database communication timeout errors
    }

    // For all other unhandled rejections, crash the node
    console.error('Something went really wrong! OT-node shutting down...', err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    // Handle ERR_UNSUPPORTED_PROTOCOL errors gracefully
    if (err && err.code === 'ERR_UNSUPPORTED_PROTOCOL') {
        console.warn(`Unsupported protocol error (ERR_UNSUPPORTED_PROTOCOL): ${err.message}`);
        return; // Don't crash for protocol errors
    }

    // Handle EPIPE (broken pipe) errors gracefully
    if (err && (err.code === 'EPIPE' || err.errno === -32)) {
        console.warn(`Broken pipe error (EPIPE): ${err.message}`);
        return; // Don't crash for broken pipe errors
    }

    // Handle ECONNRESET errors gracefully
    if (err && (err.code === 'ECONNRESET' || err.errno === -104)) {
        console.warn(`Network connection reset (ECONNRESET): ${err.message}`);
        return; // Don't crash for connection reset errors
    }

    // Handle ETIMEDOUT errors gracefully - these are common database connection timeouts
    if (err && (err.code === 'ETIMEDOUT' || err.errno === -110)) {
        console.warn(`Connection timeout error (ETIMEDOUT): ${err.message}`);
        return; // Don't crash for timeout errors
    }

    // Handle Sequelize "Got timeout reading communication packets" errors gracefully
    if (err && err.message && err.message.includes('Got timeout reading communication packets')) {
        console.warn(`Sequelize communication timeout error: ${err.message}`);
        return; // Don't crash for database communication timeout errors
    }

    console.error('Something went really wrong! OT-node shutting down...', err);
    process.exit(1);
});

/**
 * Simple OT-Node Library
 * Provides a single instance that can be started and stopped
 */
class OTNodeLibrary {
    constructor() {
        this.node = null;
        this.isRunning = false;
    }

    /**
     * Start the OT-Node
     * @param {Object} config - Configuration object or path to config file
     * @param {Object} options - Additional options
     * @returns {Promise<OTNode>} The started OT-Node instance
     */
    async start(config = null, options = {}) {
        if (this.isRunning) {
            throw new Error('OT-Node is already running. Call stop() first.');
        }

        const { dataPath = null, logLevel = 'info', silent = false } = options;

        // Set environment variables
        process.env.OT_NODE_LIBRARY_MODE = 'true';
        if (dataPath) {
            process.env.OT_NODE_DATA_PATH = dataPath;
        }
        if (logLevel) {
            process.env.LOG_LEVEL = logLevel;
        }
        if (silent) {
            process.env.OT_NODE_SILENT = 'true';
        }

        try {
            // Create OT-Node instance
            const userConfig = JSON.parse(await fs.promises.readFile(config));
            this.node = new OTNode(userConfig);

            // Override the stop method to prevent process.exit
            this.node.stop = () => {
                console.log('Stopping node...');
                this.isRunning = false;
                this.node = null;
            };

            // Override handleExit to prevent process.exit
            this.node.handleExit = async () => {
                console.log('SIGINT or SIGTERM received. Shutting down node...');
                const commandExecutor = this.node.container?.resolve('commandExecutor');
                if (commandExecutor) {
                    await commandExecutor.commandExecutorShutdown();
                }
                this.isRunning = false;
                this.node = null;
            };

            // Start the node
            await this.node.start();
            this.isRunning = true;

            return this.node;
        } catch (error) {
            this.node = null;
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the OT-Node
     * @returns {Promise<boolean>} True if node was stopped, false if not running
     */
    async stop() {
        if (!this.isRunning || !this.node) {
            return false;
        }

        this.node.stop();
        return true;
    }

    /**
     * Get the current node instance
     * @returns {OTNode|null} Node instance or null if not running
     */
    getNode() {
        return this.node;
    }

    /**
     * Check if the node is running
     * @returns {boolean} True if node is running
     */
    isNodeRunning() {
        return this.isRunning;
    }
}

// Export the library and OTNode class
export { OTNodeLibrary, OTNode };
export default OTNodeLibrary;
