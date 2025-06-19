import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BLAZEGRAPH_HEALTH_INTERVAL, TRIPLE_STORE_REPOSITORY } from '../constants/constants.js';

class BlazegraphHealthService {
    constructor(ctx) {
        this.ctx = ctx;
        this.logger = ctx.logger;
        this.tripleStoreModuleManager = ctx.tripleStoreModuleManager;
        this.operationIdService = ctx.operationIdService;
    }

    async initialize() {
        const tripleStoreConfig =
            this.ctx.config.modules.tripleStore.implementation['ot-blazegraph'];
        const blazgraphEnabled = tripleStoreConfig.enabled;
        if (blazgraphEnabled) {
            let isRunning = false;
            setInterval(async () => {
                // Skip if already running
                if (isRunning) {
                    this.logger.debug(
                        `[BLAZEGRAPH HEALTH] Blazegraph health check still running, skipping this interval`,
                    );
                    return;
                }

                try {
                    isRunning = true;
                    this.logger.debug(`[BLAZEGRAPH HEALTH] Starting blazegraph health check`);

                    await this.checkBlazegraphHealth();
                    this.logger.debug(`[BLAZEGRAPH HEALTH] Completed blazegraph health check`);
                } catch (error) {
                    this.logger.error(
                        `[BLAZEGRAPH HEALTH] Error in blazegraph health check: ${error.message}, stack: ${error.stack}`,
                    );
                } finally {
                    isRunning = false;
                }
            }, BLAZEGRAPH_HEALTH_INTERVAL);
        } else {
            this.logger.info(
                `[BLAZEGRAPH HEALTH] Blazegraph is not used, skipping health check initialization`,
            );
        }
    }

    async checkBlazegraphHealth() {
        const repositoryUrl = this.tripleStoreModuleManager.getRepositoryUrl(
            'ot-blazegraph',
            TRIPLE_STORE_REPOSITORY.DKG,
        );

        try {
            const response = await axios.get(`${repositoryUrl}/blazegraph/status`, {
                timeout: 1000,
            });

            if (response.status === 200) {
                this.logger.info('[BLAZEGRAPH HEALTH] Blazegraph is healthy');
            } else {
                this.logger.error(`[BLAZEGRAPH HEALTH] Unexpected status code: ${response.status}`);
                this.restartBlazegraph();
            }
        } catch (error) {
            this.logger.error(
                '[BLAZEGRAPH HEALTH] Blazegraph is not healthy',
                error.message || error,
            );
            await this.restartBlazegraph();
        }
    }

    async restartBlazegraph() {
        const execAsync = promisify(exec);
        try {
            const { stdout, stderr } = await execAsync('systemctl restart blazegraph.service');

            if (stderr) {
                this.logger.warn(`[BLAZEGRAPH HEALTH] Restarted with warnings: ${stderr}`);
            }

            this.logger.info(
                `[BLAZEGRAPH HEALTH] Blazegraph restarted successfully. Output: ${stdout}`,
            );
        } catch (error) {
            this.logger.error(`[BLAZEGRAPH HEALTH] Failed to restart Blazegraph: ${error.message}`);
        }
    }
}

export default BlazegraphHealthService;
