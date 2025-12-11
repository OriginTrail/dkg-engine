class RpcRouter {
    constructor(ctx) {
        this.networkModuleManager = ctx.networkModuleManager;
        this.blockchainModuleManager = ctx.blockchainModuleManager;

        this.protocolService = ctx.protocolService;
        this.logger = ctx.logger;

        this.publishRpcController = ctx.publishRpcController;
        this.getRpcController = ctx.getRpcController;
        this.updateRpcController = ctx.updateRpcController;
        this.askRpcController = ctx.askRpcController;
        this.finalityRpcController = ctx.finalityRpcController;
        this.batchGetRpcController = ctx.batchGetRpcController;
    }

    initialize() {
        this.initializeListeners();
    }

    initializeListeners() {
        const protocols = this.protocolService.getProtocols().flatMap((p) => p);

        for (const protocol of protocols) {
            const version = this.protocolService.toAwilixVersion(protocol);
            const operation = this.protocolService.toOperation(protocol);
            const handleRequest = `${version}HandleRequest`;
            const controller = `${operation}RpcController`;
            const blockchainImplementations = this.blockchainModuleManager.getImplementationNames();

            this.networkModuleManager.handleMessage(protocol, (message, remotePeerId) => {
                const operationId = message.header?.operationId;
                const messageType = message.header?.messageType;

                // Extract identifiers for logging
                const { blockchain, contract, tokenId, datasetRoot } = message.data || {};
                const ual =
                    blockchain && contract && tokenId
                        ? `did:dkg:${blockchain}/${contract}/${tokenId}`
                        : 'N/A';

                // Log incoming message at router level
                const hasMessageData = message.data !== undefined && message.data !== null;
                const messageDataKeys = hasMessageData ? Object.keys(message.data) : [];
                const hasDataset = message.data?.dataset !== undefined;
                const isDatasetNull = message.data?.dataset === null;
                const datasetSize =
                    hasDataset && !isDatasetNull ? JSON.stringify(message.data.dataset).length : 0;

                this.logger.debug(
                    `[rpc-router-debug] Message received at router. Protocol: ${protocol}, operation: ${operation}, operationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, messageType: ${messageType}, remotePeerId: ${remotePeerId}`,
                );

                this.logger.debug(
                    `[rpc-router-debug] Message data inspection. OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, hasData: ${hasMessageData}, dataKeys: [${messageDataKeys.join(
                        ', ',
                    )}], hasDataset: ${hasDataset}, isDatasetNull: ${isDatasetNull}, datasetSize: ${datasetSize} bytes`,
                );

                if (isDatasetNull) {
                    this.logger.error(
                        `[rpc-router-debug] DATASET IS NULL AT ROUTER LEVEL! OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}, protocol: ${protocol}. This indicates the sender sent null or data was corrupted in transit.`,
                    );
                }

                if (hasMessageData && !hasDataset && operation === 'publish') {
                    this.logger.error(
                        `[rpc-router-debug] DATASET MISSING FROM PUBLISH MESSAGE! OperationId: ${operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}. Available keys: [${messageDataKeys.join(
                            ', ',
                        )}]`,
                    );
                }

                const modifiedMessage = this.modifyMessage(message, blockchainImplementations);
                this[controller][handleRequest](modifiedMessage, remotePeerId, protocol);
            });
        }
    }

    modifyMessage(message, blockchainImplementations) {
        const modifiedMessage = message;
        if (modifiedMessage.data.blockchain?.split(':').length === 1) {
            for (const implementation of blockchainImplementations) {
                if (implementation.split(':')[0] === modifiedMessage.data.blockchain) {
                    modifiedMessage.data.blockchain = implementation;
                    break;
                }
            }
        }
        return modifiedMessage;
    }
}

export default RpcRouter;
