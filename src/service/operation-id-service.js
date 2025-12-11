import { validate, v4 as uuidv4 } from 'uuid';
import path from 'path';

class OperationIdService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.fileService = ctx.fileService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.eventEmitter = ctx.eventEmitter;

        this.memoryCachedHandlersData = {};
    }

    generateId() {
        return uuidv4();
    }

    async generateOperationId(status, blockchain, previousOperationId = null) {
        const operationIdObject = await this.repositoryModuleManager.createOperationIdRecord({
            status,
        });
        const { operationId } = operationIdObject;
        this.emitChangeEvent(status, operationId, blockchain, previousOperationId);
        this.logger.debug(`Generated operation id for request ${operationId}`);
        return operationId;
    }

    async getOperationIdRecord(operationId) {
        const operationIdRecord = await this.repositoryModuleManager.getOperationIdRecord(
            operationId,
        );
        return operationIdRecord;
    }

    operationIdInRightFormat(operationId) {
        return validate(operationId);
    }

    async updateOperationIdStatusWithValues(
        operationId,
        blockchain,
        status,
        value1 = null,
        value2 = null,
        value3 = null,
        timestamp = Date.now(),
    ) {
        const response = {
            status,
            timestamp,
        };

        this.emitChangeEvent(status, operationId, blockchain, value1, value2, value3, timestamp);

        await this.repositoryModuleManager.updateOperationIdRecord(response, operationId);
    }

    async updateOperationIdStatus(
        operationId,
        blockchain,
        status,
        errorMessage = null,
        errorType = null,
    ) {
        const response = {
            status,
        };

        if (errorMessage !== null) {
            this.logger.debug(`Marking operation id ${operationId} as failed`);
            response.data = JSON.stringify({ errorMessage, errorType });
            await this.removeOperationIdCache(operationId);
        }

        if (errorType) {
            this.emitChangeEvent(errorType, operationId, blockchain, errorMessage, errorType);
        } else {
            this.emitChangeEvent(status, operationId, blockchain, errorMessage, errorType);
        }
        await this.repositoryModuleManager.updateOperationIdRecord(response, operationId);
    }

    emitChangeEvent(
        status,
        operationId,
        blockchainId = null,
        value1 = null,
        value2 = null,
        value3 = null,
        timestamp = Date.now(),
    ) {
        const eventName = 'operation_status_changed';

        const eventData = {
            lastEvent: status,
            operationId,
            blockchainId,
            timestamp,
            value1,
            value2,
            value3,
        };

        this.eventEmitter.emit(eventName, eventData);
    }

    async cacheOperationIdDataToMemory(operationId, data) {
        this.logger.debug(`Caching data for operation id: ${operationId} in memory`);

        // Log data structure being cached
        const dataKeys = data ? Object.keys(data) : [];
        const dataSize = data ? JSON.stringify(data).length : 0;
        const hasDataset = data?.dataset !== undefined;
        const datasetSize = hasDataset ? JSON.stringify(data.dataset).length : 0;

        this.logger.debug(
            `[cache-debug] Caching to memory. OperationId: ${operationId}, data keys: [${dataKeys.join(
                ', ',
            )}], total size: ${dataSize} bytes, has dataset: ${hasDataset}, dataset size: ${datasetSize} bytes`,
        );

        if (hasDataset) {
            const datasetType = typeof data.dataset;
            const isDatasetNull = data.dataset === null;
            const datasetPublicSize = data.dataset?.public
                ? JSON.stringify(data.dataset.public).length
                : 0;
            const datasetPrivateSize = data.dataset?.private
                ? JSON.stringify(data.dataset.private).length
                : 0;
            this.logger.debug(
                `[cache-debug] Dataset details for operationId: ${operationId}, type: ${datasetType}, isNull: ${isDatasetNull}, public size: ${datasetPublicSize} bytes, private size: ${datasetPrivateSize} bytes`,
            );
        }

        this.memoryCachedHandlersData[operationId] = { data, timestamp: Date.now() };
    }

    async cacheOperationIdDataToFile(operationId, data) {
        this.logger.debug(`Caching data for operation id: ${operationId} in file`);
        const operationIdCachePath = this.fileService.getOperationIdCachePath();

        const dataSize = data ? JSON.stringify(data).length : 0;
        this.logger.debug(
            `[cache-debug] Caching to file. OperationId: ${operationId}, path: ${operationIdCachePath}, size: ${dataSize} bytes`,
        );

        await this.fileService.writeContentsToFile(
            operationIdCachePath,
            operationId,
            JSON.stringify(data),
        );
    }

    async getCachedOperationIdData(operationId) {
        if (this.memoryCachedHandlersData[operationId]) {
            this.logger.debug(`Reading operation id: ${operationId} cached data from memory`);

            const cachedEntry = this.memoryCachedHandlersData[operationId];
            const { data, timestamp } = cachedEntry;
            const cacheAge = Date.now() - timestamp;

            // Log what we're returning from cache
            const dataKeys = data ? Object.keys(data) : [];
            const hasDataset = data?.dataset !== undefined;
            const datasetSize = hasDataset ? JSON.stringify(data.dataset).length : 0;
            const isDatasetNull = hasDataset && data.dataset === null;
            const isDatasetPublicNull = hasDataset && data.dataset?.public === null;
            const isDatasetPublicUndefined = hasDataset && data.dataset?.public === undefined;

            this.logger.debug(
                `[cache-debug] Memory cache HIT. OperationId: ${operationId}, cache age: ${cacheAge}ms, data keys: [${dataKeys.join(
                    ', ',
                )}], has dataset: ${hasDataset}, dataset size: ${datasetSize} bytes`,
            );

            if (hasDataset) {
                this.logger.debug(
                    `[cache-debug] Dataset state in cache. OperationId: ${operationId}, isNull: ${isDatasetNull}, public isNull: ${isDatasetPublicNull}, public isUndefined: ${isDatasetPublicUndefined}`,
                );
            }

            return data;
        }

        this.logger.debug(
            `[cache-debug] Memory cache MISS for operationId: ${operationId}, trying file`,
        );
        const documentPath = this.fileService.getOperationIdDocumentPath(operationId);
        let data;
        if (await this.fileService.pathExists(documentPath)) {
            this.logger.debug(
                `[cache-debug] File cache exists for operationId: ${operationId}, path: ${documentPath}`,
            );
            try {
                data = await this.fileService.readFile(documentPath, true);

                // Log what we read from file
                const dataKeys = data ? Object.keys(data) : [];
                const hasDataset = data?.dataset !== undefined;
                const datasetSize = hasDataset ? JSON.stringify(data.dataset).length : 0;

                this.logger.debug(
                    `[cache-debug] File cache read success. OperationId: ${operationId}, data keys: [${dataKeys.join(
                        ', ',
                    )}], has dataset: ${hasDataset}, dataset size: ${datasetSize} bytes`,
                );
            } catch (error) {
                this.logger.error(
                    `[cache-debug] File cache read FAILED. OperationId: ${operationId}, path: ${documentPath}, error: ${error.message}`,
                );
                throw error;
            }
        } else {
            this.logger.warn(
                `[cache-debug] File cache MISS (file does not exist). OperationId: ${operationId}, path: ${documentPath}`,
            );
        }
        return data;
    }

    async removeOperationIdCache(operationId) {
        this.logger.debug(`Removing operation id: ${operationId} cached data`);
        const operationIdCachePath = this.fileService.getOperationIdDocumentPath(operationId);
        await this.fileService.removeFile(operationIdCachePath);
        this.removeOperationIdMemoryCache(operationId);
    }

    removeOperationIdMemoryCache(operationId) {
        this.logger.debug(`Removing operation id: ${operationId} cached data from memory`);
        delete this.memoryCachedHandlersData[operationId];
    }

    async removeExpiredOperationIdMemoryCache(expiredTimeout) {
        const now = Date.now();
        let deleted = 0;
        for (const operationId in this.memoryCachedHandlersData) {
            const { data, timestamp } = this.memoryCachedHandlersData[operationId];
            if (timestamp + expiredTimeout < now) {
                delete this.memoryCachedHandlersData[operationId];
                deleted += Buffer.from(JSON.stringify(data)).byteLength;
            }
        }
        return deleted;
    }

    async removeExpiredOperationIdFileCache(expiredTimeout, batchSize) {
        const cacheFolderPath = this.fileService.getOperationIdCachePath();
        const cacheFolderExists = await this.fileService.pathExists(cacheFolderPath);
        if (!cacheFolderExists) {
            return;
        }
        const fileList = await this.fileService.readDirectory(cacheFolderPath);

        const now = new Date();
        const deleteFile = async (fileName) => {
            const filePath = path.join(cacheFolderPath, fileName);
            const createdDate = (await this.fileService.stat(filePath)).mtime;
            if (createdDate.getTime() + expiredTimeout < now.getTime()) {
                await this.fileService.removeFile(filePath);
                return true;
            }
            return false;
        };
        let totalDeleted = 0;
        for (let i = 0; i < fileList.length; i += batchSize) {
            const batch = fileList.slice(i, i + batchSize);
            // eslint-disable-next-line no-await-in-loop
            const deletionResults = await Promise.allSettled(batch.map(deleteFile));
            totalDeleted += deletionResults.filter(
                (result) => result.status === 'fulfilled' && result.value,
            ).length;
        }

        return totalDeleted;
    }
}

export default OperationIdService;
