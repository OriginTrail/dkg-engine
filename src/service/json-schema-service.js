import path from 'path';
import { fileURLToPath } from 'url';

class JsonSchemaService {
    constructor(ctx) {
        this.blockchainModuleManager = ctx.blockchainModuleManager;
    }

    async loadSchema(version, schemaName, argumentsObject = {}) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        // Get the package root directory (two levels up from this file)
        const packageRoot = path.resolve(__dirname, '..', '..');

        const schemaPath = path.resolve(
            packageRoot, // This will resolve to the origintrail-node package directory
            `src/controllers/http-api/${version}/request-schema/${schemaName}-schema-${version}.js`,
        );
        const schemaModule = await import(schemaPath);
        const schemaFunction = schemaModule.default;

        if (schemaFunction.length !== 0) {
            return schemaFunction(argumentsObject);
        }

        return schemaFunction();
    }

    async bidSuggestionSchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v0':
            case 'v1':
                schemaArgs.blockchainImplementationNames =
                    this.blockchainModuleManager.getImplementationNames();
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'bid-suggestion', schemaArgs);
    }

    async publishSchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v0':
            case 'v1':
                schemaArgs.blockchainImplementationNames =
                    this.blockchainModuleManager.getImplementationNames();
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'publish', schemaArgs);
    }

    async updateSchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v0':
            case 'v1':
                schemaArgs.blockchainImplementationNames =
                    this.blockchainModuleManager.getImplementationNames();
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'update', schemaArgs);
    }

    async getSchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v0':
            case 'v1':
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'get', schemaArgs);
    }

    async querySchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v0':
            case 'v1':
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'query', schemaArgs);
    }

    async localStoreSchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v0':
            case 'v1':
                schemaArgs.blockchainImplementationNames =
                    this.blockchainModuleManager.getImplementationNames();
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'local-store', schemaArgs);
    }

    async finalitySchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v1':
                schemaArgs.blockchainImplementationNames =
                    this.blockchainModuleManager.getImplementationNames();
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'finality', schemaArgs);
    }

    async askSchema(version) {
        const schemaArgs = {};

        switch (version) {
            case 'v1':
                schemaArgs.blockchainImplementationNames =
                    this.blockchainModuleManager.getImplementationNames();
                break;
            default:
                throw Error(`HTTP API version: ${version} isn't supported.`);
        }

        return this.loadSchema(version, 'ask', schemaArgs);
    }
}

export default JsonSchemaService;
