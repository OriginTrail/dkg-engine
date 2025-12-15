import { describe, it } from 'mocha';
import { expect } from 'chai';

import PublishController from '../../../src/controllers/http-api/v1/publish-http-api-controller-v1.js';
import { PUBLISH_MIN_NUM_OF_NODE_REPLICATIONS } from '../../../src/constants/constants.js';

const createRes = () => {
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        send(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
};

describe('publish-http-api-controller-v1', () => {
    const baseCtx = () => {
        const addedCommands = [];
        return {
            commandExecutor: {
                add: async (cmd) => {
                    addedCommands.push(cmd);
                },
                _added: addedCommands,
            },
            publishService: {
                getOperationName: () => 'publish',
            },
            operationIdService: {
                generateOperationId: async () => 'op-id-123',
                emitChangeEvent: () => {},
                updateOperationIdStatus: async () => {},
                cacheOperationIdDataToMemory: async () => {},
                cacheOperationIdDataToFile: async () => {},
            },
            repositoryModuleManager: {
                createOperationRecord: async () => {},
            },
            pendingStorageService: {
                cacheDataset: async () => {},
            },
            networkModuleManager: {
                getPeerId: () => ({ toB58String: () => 'peer-self' }),
            },
            blockchainModuleManager: {
                getMinimumRequiredSignatures: async () => PUBLISH_MIN_NUM_OF_NODE_REPLICATIONS,
            },
            logger: {
                info: () => {},
                warn: () => {},
                error: () => {},
            },
        };
    };

    it('clamps minimumNumberOfNodeReplications to on-chain minimum', async () => {
        const ctx = baseCtx();
        ctx.blockchainModuleManager.getMinimumRequiredSignatures = async () => 5; // on-chain min
        const controller = new PublishController(ctx);

        const req = {
            body: {
                dataset: { public: {} },
                datasetRoot: '0xroot',
                blockchain: 'hardhat',
                minimumNumberOfNodeReplications: 2, // below chain min
            },
        };
        const res = createRes();

        await controller.handleRequest(req, res);

        expect(res.statusCode).to.equal(202);
        const added = ctx.commandExecutor._added[0];
        expect(added.data.minimumNumberOfNodeReplications).to.equal(5);
    });

    it('allows higher user override than on-chain minimum', async () => {
        const ctx = baseCtx();
        ctx.blockchainModuleManager.getMinimumRequiredSignatures = async () => 3; // on-chain min
        const controller = new PublishController(ctx);

        const req = {
            body: {
                dataset: { public: {} },
                datasetRoot: '0xroot',
                blockchain: 'hardhat',
                minimumNumberOfNodeReplications: 7, // above chain min
            },
        };
        const res = createRes();

        await controller.handleRequest(req, res);

        expect(res.statusCode).to.equal(202);
        const added = ctx.commandExecutor._added[0];
        expect(added.data.minimumNumberOfNodeReplications).to.equal(7);
    });

    it('falls back to on-chain minimum when user value is zero or invalid', async () => {
        const ctx = baseCtx();
        ctx.blockchainModuleManager.getMinimumRequiredSignatures = async () => 4; // on-chain min
        const controller = new PublishController(ctx);

        const req = {
            body: {
                dataset: { public: {} },
                datasetRoot: '0xroot',
                blockchain: 'hardhat',
                minimumNumberOfNodeReplications: 0, // invalid/zero
            },
        };
        const res = createRes();

        await controller.handleRequest(req, res);

        expect(res.statusCode).to.equal(202);
        const added = ctx.commandExecutor._added[0];
        expect(added.data.minimumNumberOfNodeReplications).to.equal(4);
    });
});
