import { Mutex } from 'async-mutex';
import {
    OPERATION_ID_STATUS,
    OPERATION_REQUEST_STATUS,
    OPERATION_STATUS,
} from '../constants/constants.js';

const MUTEX_TTL_MS = 5 * 60 * 1000;
const MUTEX_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

class OperationService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.operationIdService = ctx.operationIdService;
        this.commandExecutor = ctx.commandExecutor;
        this._operationMutexes = new Map();
        this._terminalOperations = new Map();

        this._sweepInterval = setInterval(() => this._sweepStaleMutexes(), MUTEX_SWEEP_INTERVAL_MS);
        if (this._sweepInterval.unref) {
            this._sweepInterval.unref();
        }
    }

    _getOperationMutex(operationId) {
        if (!this._operationMutexes.has(operationId)) {
            this._operationMutexes.set(operationId, new Mutex());
        }
        return this._operationMutexes.get(operationId);
    }

    _markOperationTerminal(operationId) {
        this._terminalOperations.set(operationId, Date.now());
    }

    _isOperationTerminal(operationId) {
        return this._terminalOperations.has(operationId);
    }

    _sweepStaleMutexes() {
        const now = Date.now();
        for (const [operationId, terminatedAt] of this._terminalOperations) {
            if (now - terminatedAt >= MUTEX_TTL_MS) {
                this._operationMutexes.delete(operationId);
                this._terminalOperations.delete(operationId);
            }
        }
    }

    getOperationName() {
        return this.operationName;
    }

    getNetworkProtocols() {
        return this.networkProtocols;
    }

    async getOperationStatus(operationId) {
        return this.repositoryModuleManager.getOperationStatus(
            this.getOperationName(),
            operationId,
        );
    }

    async getResponsesStatuses(responseStatus, errorMessage, operationId) {
        let responses = 0;
        const self = this;
        const mutex = this._getOperationMutex(operationId);
        await mutex.runExclusive(async () => {
            if (self._isOperationTerminal(operationId)) {
                self.logger.debug(`Skipping late response for terminal operation ${operationId}`);
                return;
            }
            await self.repositoryModuleManager.createOperationResponseRecord(
                responseStatus,
                this.operationName,
                operationId,
                errorMessage,
            );
            responses = await self.repositoryModuleManager.getOperationResponsesStatuses(
                this.operationName,
                operationId,
            );
        });

        const operationIdStatuses = {};
        for (const response of responses) {
            if (!operationIdStatuses[operationId])
                operationIdStatuses[operationId] = { failedNumber: 0, completedNumber: 0 };

            if (response.status === OPERATION_REQUEST_STATUS.FAILED) {
                operationIdStatuses[operationId].failedNumber += 1;
            } else {
                operationIdStatuses[operationId].completedNumber += 1;
            }
        }

        return operationIdStatuses;
    }

    async markOperationAsCompleted(
        operationId,
        blockchain,
        responseData,
        endStatuses,
        options = {},
    ) {
        this._markOperationTerminal(operationId);
        const { reuseExistingCache = false } = options;
        this.logger.info(`Finalizing ${this.operationName} for operationId: ${operationId}`);

        await this.repositoryModuleManager.updateOperationStatus(
            this.operationName,
            operationId,
            OPERATION_STATUS.COMPLETED,
        );

        if (responseData === null) {
            await this.operationIdService.removeOperationIdCache(operationId);
        } else {
            await this.operationIdService.cacheOperationIdDataToMemory(operationId, responseData);
            if (!reuseExistingCache) {
                await this.operationIdService.cacheOperationIdDataToFile(operationId, responseData);
            }
        }

        for (let i = 0; i < endStatuses.length; i += 1) {
            const status = endStatuses[i];
            const response = {
                status,
            };

            this.operationIdService.emitChangeEvent(status, operationId, blockchain);
            if (i === endStatuses.length - 1) {
                // eslint-disable-next-line no-await-in-loop
                await this.repositoryModuleManager.updateOperationIdRecord(response, operationId);
            }
        }
    }

    async markOperationAsFailed(operationId, blockchain, message, errorType) {
        this._markOperationTerminal(operationId);
        this.logger.info(`${this.operationName} for operationId: ${operationId} failed.`);

        await this.operationIdService.removeOperationIdCache(operationId);

        await this.repositoryModuleManager.updateOperationStatus(
            this.operationName,
            operationId,
            OPERATION_STATUS.FAILED,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.FAILED,
            message,
            errorType,
        );
    }

    async scheduleOperationForLeftoverNodes(commandData, leftoverNodes) {
        await this.commandExecutor.add({
            name: `${this.operationName}ScheduleMessagesCommand`,
            delay: 0,
            data: { ...commandData, leftoverNodes },
            transactional: false,
        });
    }

    logResponsesSummary(completedNumber, failedNumber) {
        this.logger.info(
            `Total number of responses: ${
                failedNumber + completedNumber
            }, failed: ${failedNumber}, completed: ${completedNumber}`,
        );
    }

    getBatchSize() {
        throw Error('getBatchSize not implemented');
    }

    getMinAckResponses() {
        throw Error('getMinAckResponses not implemented');
    }
}

export default OperationService;
