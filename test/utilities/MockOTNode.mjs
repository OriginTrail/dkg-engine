import OTNode from '../../ot-node.js';

export default class MockOTNode extends OTNode {
    async startNetworkModule() {
        this.logger.info('[Mock] Skipping startNetworkModule in test');
        // Do nothing
    }

    async stop() {
        this.logger.info('[Mock] Stopping node...');
        try {
            // Stop command executor
            const commandExecutor = this.container?.resolve('commandExecutor');
            if (commandExecutor) {
                await commandExecutor.commandExecutorShutdown();
            }

            // Stop HTTP server
            const httpClientModuleManager = this.container?.resolve('httpClientModuleManager');
            if (httpClientModuleManager?.close) {
                await httpClientModuleManager.close();
            }

            // Stop blockchain event listeners
            const blockchainEventsService = this.container?.resolve('blockchainEventsService');
            if (blockchainEventsService?.stopListening) {
                await blockchainEventsService.stopListening();
            }

            this.logger.info('[Mock] Node stopped successfully');
        } catch (error) {
            this.logger.error(`[Mock] Error stopping node: ${error.message}`);
            throw error;
        }
    }
}