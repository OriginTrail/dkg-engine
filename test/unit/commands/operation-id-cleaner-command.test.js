import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

import OperationIdCleanerCommand from '../../../src/commands/cleaners/operation-id-cleaner-command.js';
import {
    OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS,
    OPERATION_ID_FILES_FOR_REMOVAL_MAX_NUMBER,
    OPERATION_ID_MEMORY_CLEANUP_TIME_MILLS,
    OPERATION_ID_STATUS,
} from '../../../src/constants/constants.js';

describe('OperationIdCleanerCommand', () => {
    let clock;
    let operationIdService;
    let repositoryModuleManager;
    let logger;
    let command;

    beforeEach(() => {
        clock = sinon.useFakeTimers(new Date('2023-01-01T00:00:00Z').getTime());

        operationIdService = {
            getOperationIdMemoryCacheSizeBytes: sinon.stub().returns(1024),
            getOperationIdFileCacheSizeBytes: sinon.stub().resolves(2048),
            removeExpiredOperationIdMemoryCache: sinon.stub().resolves(512),
            removeExpiredOperationIdFileCache: sinon.stub().resolves(3),
        };

        repositoryModuleManager = {
            removeOperationIdRecord: sinon.stub().resolves(),
        };

        logger = {
            debug: sinon.spy(),
            info: sinon.spy(),
            warn: sinon.spy(),
            error: sinon.spy(),
        };

        command = new OperationIdCleanerCommand({
            logger,
            repositoryModuleManager,
            operationIdService,
            fileService: {},
        });
    });

    afterEach(() => {
        clock.restore();
    });

    it('cleans memory with 1h TTL and files with 24h TTL while reporting footprint', async () => {
        await command.execute();

        expect(operationIdService.getOperationIdMemoryCacheSizeBytes.calledOnce).to.be.true;
        expect(operationIdService.getOperationIdFileCacheSizeBytes.calledOnce).to.be.true;

        expect(
            repositoryModuleManager.removeOperationIdRecord.calledWith(
                Date.now() - OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS,
                [OPERATION_ID_STATUS.COMPLETED, OPERATION_ID_STATUS.FAILED],
            ),
        ).to.be.true;

        expect(
            operationIdService.removeExpiredOperationIdMemoryCache.calledWith(
                OPERATION_ID_MEMORY_CLEANUP_TIME_MILLS,
            ),
        ).to.be.true;

        expect(
            operationIdService.removeExpiredOperationIdFileCache.calledWith(
                OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS,
                OPERATION_ID_FILES_FOR_REMOVAL_MAX_NUMBER,
            ),
        ).to.be.true;

        expect(logger.debug.called).to.be.true;
    });

    it('handles missing memory cache gracefully', async () => {
        operationIdService.getOperationIdMemoryCacheSizeBytes.throws(new Error('no memory cache'));
        await command.execute();

        expect(
            repositoryModuleManager.removeOperationIdRecord.calledWith(
                Date.now() - OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS,
                [OPERATION_ID_STATUS.COMPLETED, OPERATION_ID_STATUS.FAILED],
            ),
        ).to.be.true;

        expect(
            operationIdService.removeExpiredOperationIdFileCache.calledWith(
                OPERATION_ID_COMMAND_CLEANUP_TIME_MILLS,
                OPERATION_ID_FILES_FOR_REMOVAL_MAX_NUMBER,
            ),
        ).to.be.true;
    });
});
