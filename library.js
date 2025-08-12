import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

/**
 * OT-Node Library using Child Process
 * Provides a clean way to start and stop OT-Node as a separate process
 */
class OTNodeLibrary {
    constructor() {
        this.childProcess = null;
        this.isRunning = false;
        this.config = null;
        this.options = {};
    }

    /**
     * Start the OT-Node as a child process
     * @param {string|Object} config - Path to config file or config object
     * @param {Object} options - Additional options
     * @returns {Promise<boolean>} True if node started successfully
     */
    async start(config = null, options = {}) {
        if (this.isRunning) {
            throw new Error('OT-Node is already running. Call stop() first.');
        }

        this.config = config;
        this.options = options;

        const { dataPath = null, logLevel = 'info', silent = false } = options;

        // Set up environment variables
        const env = { ...process.env };
        env.NODE_ENV = 'development';
        if (dataPath) {
            env.OT_NODE_DATA_PATH = dataPath;
        }
        if (logLevel) {
            env.LOG_LEVEL = logLevel;
        }
        if (silent) {
            env.OT_NODE_SILENT = 'true';
        }

        try {
            // Determine config file path
            let configPath = null;
            if (typeof config === 'string') {
                configPath = config;
            } else if (config) {
                // Write config object to temporary file
                configPath = path.join(process.cwd(), 'temp-config.json');
                await fs.writeJson(configPath, config);
            }

            // Spawn the OT-Node process
            const nodeArgs = ['index.js'];
            if (configPath) {
                nodeArgs.push(configPath);
            }

            this.childProcess = spawn('node', nodeArgs, {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false,
            });

            // Handle process events
            this.childProcess.on('error', (error) => {
                console.error('Failed to start OT-Node process:', error);
                this.isRunning = false;
                this.childProcess = null;
            });

            this.childProcess.on('exit', (code, signal) => {
                console.log(`OT-Node process exited with code ${code} and signal ${signal}`);
                this.isRunning = false;
                this.childProcess = null;
            });

            // Handle stdout and stderr
            this.childProcess.stdout.on('data', (data) => {
                if (!silent) {
                    process.stdout.write(data);
                }
            });

            this.childProcess.stderr.on('data', (data) => {
                if (!silent) {
                    process.stderr.write(data);
                }
            });

            // Wait for the process to start
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('OT-Node failed to start within 30 seconds'));
                }, 30000);

                this.childProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    if (output.includes('Node is up and running!')) {
                        clearTimeout(timeout);
                        this.isRunning = true;
                        resolve();
                    }
                });

                this.childProcess.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });

                this.childProcess.on('exit', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0) {
                        reject(new Error(`OT-Node process exited with code ${code}`));
                    }
                });
            });

            return true;
        } catch (error) {
            this.isRunning = false;
            this.childProcess = null;
            throw error;
        }
    }

    /**
     * Stop the OT-Node process
     * @returns {Promise<boolean>} True if node was stopped, false if not running
     */
    async stop() {
        if (!this.isRunning || !this.childProcess) {
            return false;
        }

        return new Promise((resolve) => {
            // Send SIGTERM for graceful shutdown
            this.childProcess.kill('SIGTERM');

            // Wait for process to exit
            const timeout = setTimeout(() => {
                // Force kill if it doesn't exit gracefully
                this.childProcess.kill('SIGKILL');
                this.isRunning = false;
                this.childProcess = null;
                resolve(true);
            }, 10000);

            this.childProcess.on('exit', () => {
                clearTimeout(timeout);
                this.isRunning = false;
                this.childProcess = null;
                resolve(true);
            });
        });
    }

    /**
     * Get the child process
     * @returns {ChildProcess|null} Child process or null if not running
     */
    getProcess() {
        return this.childProcess;
    }

    /**
     * Check if the node is running
     * @returns {boolean} True if node is running
     */
    isNodeRunning() {
        return this.isRunning && this.childProcess && !this.childProcess.killed;
    }

    /**
     * Send a signal to the node process
     * @param {string} signal - Signal to send (e.g., 'SIGTERM', 'SIGINT')
     */
    sendSignal(signal) {
        if (this.childProcess && this.isRunning) {
            this.childProcess.kill(signal);
        }
    }
}

// Export the library
export { OTNodeLibrary };
export default OTNodeLibrary;
