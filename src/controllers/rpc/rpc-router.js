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
