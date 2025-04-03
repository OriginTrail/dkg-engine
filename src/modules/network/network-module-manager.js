import BaseModuleManager from '../base-module-manager.js';

class NetworkModuleManager extends BaseModuleManager {
    getName() {
        return 'network';
    }

    async start() {
        this.logger.info('.... starting Last Step');

        // Log initialized state
        this.logger.info(`[sendTelemetryCommand] Initialized value: ${this.initialized}`);

        if (this.initialized) {
            this.logger.info(
                '[sendTelemetryCommand] Module is already initialized, attempting to start...',
            );

            try {
                const implementation = this.getImplementation();
                this.logger.info(
                    `[sendTelemetryCommand] Implementation: ${JSON.stringify(
                        implementation,
                        null,
                        2,
                    )}`,
                );

                if (!implementation) {
                    throw new Error('getImplementation() returned undefined or null');
                }

                if (!implementation.module || typeof implementation.module.start !== 'function') {
                    throw new Error(
                        'Module implementation is missing or start() is not a function',
                    );
                }

                const result = await implementation.module.start();
                this.logger.info('[sendTelemetryCommand] Module started successfully:', result);
                return result;
            } catch (error) {
                this.logger.error(
                    `[sendTelemetryCommand] Error while starting module: ${error.message}`,
                );
                this.logger.error(error.stack);
                return null;
            }
        }

        this.logger.warn('[sendTelemetryCommand] Module is not initialized yet.');
        this.logger.info('... initialized Last Step');
    }

    async onPeerConnected(listener) {
        if (this.initialized) {
            return this.getImplementation().module.onPeerConnected(listener);
        }
    }

    getMultiaddrs() {
        if (this.initialized) {
            return this.getImplementation().module.getMultiaddrs();
        }
    }

    getPeers() {
        if (this.initialized) {
            return this.getImplementation().module.getPeers();
        }
    }

    async sendMessage(protocol, remotePeerId, messageType, operationId, message, timeout) {
        if (this.initialized) {
            return this.getImplementation().module.sendMessage(
                protocol,
                remotePeerId,
                messageType,
                operationId,
                message,
                timeout,
            );
        }
    }

    async sendMessageResponse(protocol, remotePeerId, messageType, operationId, message) {
        if (this.initialized) {
            return this.getImplementation().module.sendMessageResponse(
                protocol,
                remotePeerId,
                messageType,
                operationId,
                message,
            );
        }
    }

    handleMessage(protocol, handler, options) {
        if (this.initialized) {
            this.getImplementation().module.handleMessage(protocol, handler, options);
        }
    }

    getPeerId() {
        if (this.initialized) {
            return this.getImplementation().module.getPeerId();
        }
    }

    async healthCheck() {
        if (this.initialized) {
            return this.getImplementation().module.healthCheck();
        }
    }

    async findPeer(peerId) {
        if (this.initialized) {
            return this.getImplementation().module.findPeer(peerId);
        }
    }

    async dial(peerId) {
        if (this.initialized) {
            return this.getImplementation().module.dial(peerId);
        }
    }

    async getPeerInfo(peerId) {
        if (this.initialized) {
            return this.getImplementation().module.getPeerInfo(peerId);
        }
    }

    removeCachedSession(operationId, remotePeerId) {
        if (this.initialized) {
            this.getImplementation().module.removeCachedSession(operationId, remotePeerId);
        }
    }
}

export default NetworkModuleManager;
