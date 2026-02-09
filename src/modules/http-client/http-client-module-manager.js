import BaseModuleManager from '../base-module-manager.js';

class HttpClientModuleManager extends BaseModuleManager {
    constructor(ctx) {
        super(ctx);
        this.authService = ctx.authService;
    }

    getName() {
        return 'httpClient';
    }

    get(route, callback, options = {}) {
        if (this.initialized) {
            return this.getImplementation().module.get(route, callback, options);
        }
    }

    post(route, callback, options = {}) {
        if (this.initialized) {
            return this.getImplementation().module.post(route, callback, options);
        }
    }

    use(route, callback, options = {}) {
        if (this.initialized) {
            return this.getImplementation().module.use(route, callback, options);
        }
    }

    createRouterInstance() {
        if (this.initialized) {
            return this.getImplementation().module.createRouterInstance();
        }
    }

    sendResponse(res, status, returnObject) {
        if (this.initialized) {
            return this.getImplementation().module.sendResponse(res, status, returnObject);
        }
    }

    async listen() {
        if (this.initialized) {
            return this.getImplementation().module.listen();
        }
    }

    selectMiddlewares(options) {
        if (this.initialized) {
            return this.getImplementation().module.selectMiddlewares(options);
        }
    }

    initializeBeforeMiddlewares(blockchainImpelemntations) {
        if (this.initialized) {
            return this.getImplementation().module.initializeBeforeMiddlewares(
                this.authService,
                blockchainImpelemntations,
            );
        }
    }

    initializeAfterMiddlewares() {
        if (this.initialized) {
            return this.getImplementation().module.initializeAfterMiddlewares(this.authService);
        }
    }

    async close() {
        if (this.initialized && this.getImplementation().module.close) {
            return this.getImplementation().module.close();
        }
    }
}

export default HttpClientModuleManager;
