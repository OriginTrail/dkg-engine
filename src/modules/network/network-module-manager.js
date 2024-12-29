import BaseModuleManager from '../base-module-manager.js';

class NetworkModuleManager extends BaseModuleManager {
    getName() {
        return 'network';
    }

    async start() {
        if (this.initialized) {
            return this.getImplementation().module.start();
        }
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

    async addRoutingTablePeer(peerIdString, blockchainId) {
        if (this.initialized) {
            return this.getImplementation().module.addRoutingTablePeer(peerIdString, blockchainId);
        }
    }

    removeRoutingTablePeer(peerIdString, blockchainId) {
        if (this.initialized) {
            return this.getImplementation().module.removeRoutingTablePeer(
                peerIdString,
                blockchainId,
            );
        }
    }

    hasRoutingTablePeer(peerIdString) {
        if (this.initialized) {
            return this.getImplementation().module.hasRoutingTablePeer(peerIdString);
        }
    }

    async sendMessage(
        protocol,
        remotePeerId,
        messageType,
        operationId,
        keywordUuid,
        message,
        timeout,
    ) {
        if (this.initialized) {
            return this.getImplementation().module.sendMessage(
                protocol,
                remotePeerId,
                messageType,
                operationId,
                keywordUuid,
                message,
                timeout,
            );
        }
    }

    async sendMessageResponse(protocol, remotePeerId, messageType, operationId, keyword, message) {
        if (this.initialized) {
            return this.getImplementation().module.sendMessageResponse(
                protocol,
                remotePeerId,
                messageType,
                operationId,
                keyword,
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

    removeCachedSession(operationId, keywordUuid, remotePeerId) {
        if (this.initialized) {
            this.getImplementation().module.removeCachedSession(
                operationId,
                keywordUuid,
                remotePeerId,
            );
        }
    }
}

export default NetworkModuleManager;
