import path from 'path';
import {
    NETWORK_SIGNATURES_FOLDER,
    PUBLISHER_NODE_SIGNATURES_FOLDER,
} from '../constants/constants.js';

class PendingStorageService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.fileService = ctx.fileService;
        this.repositoryModuleManager = ctx.repositoryModuleManager; // this is not used
        this.tripleStoreService = ctx.tripleStoreService; // this is not used
    }

    async cacheDataset(operationId, datasetRoot, dataset, remotePeerId) {
        this.logger.debug(
            `Caching ${datasetRoot} dataset root, operation id: ${operationId} in file in pending storage`,
        );

        // Detailed logging of what's being cached
        const datasetType = typeof dataset;
        const isDatasetNull = dataset === null;
        const isDatasetUndefined = dataset === undefined;
        const datasetSize = dataset ? JSON.stringify(dataset).length : 0;
        const isArray = Array.isArray(dataset);

        this.logger.debug(
            `[pending-storage-debug] Caching dataset. OperationId: ${operationId}, datasetRoot: ${datasetRoot}, remotePeerId: ${remotePeerId}, dataset type: ${datasetType}, isNull: ${isDatasetNull}, isUndefined: ${isDatasetUndefined}, isArray: ${isArray}, size: ${datasetSize} bytes`,
        );

        if (dataset && typeof dataset === 'object') {
            const datasetKeys = Object.keys(dataset);
            this.logger.debug(
                `[pending-storage-debug] Dataset structure. OperationId: ${operationId}, keys: [${datasetKeys.join(
                    ', ',
                )}]`,
            );

            // Log sample of dataset content for debugging
            if (isArray && dataset.length > 0) {
                this.logger.debug(
                    `[pending-storage-debug] Dataset is array with ${
                        dataset.length
                    } items. OperationId: ${operationId}, first item type: ${typeof dataset[0]}`,
                );
            }
        }

        const dataToCache = {
            merkleRoot: datasetRoot,
            assertion: dataset,
            remotePeerId,
        };

        const serializedData = JSON.stringify(dataToCache);
        const cachePath = this.fileService.getPendingStorageCachePath();

        this.logger.debug(
            `[pending-storage-debug] Writing to pending storage. OperationId: ${operationId}, path: ${cachePath}, serialized size: ${serializedData.length} bytes`,
        );

        try {
            await this.fileService.writeContentsToFile(cachePath, operationId, serializedData);
            this.logger.debug(
                `[pending-storage-debug] Successfully cached dataset. OperationId: ${operationId}`,
            );
        } catch (error) {
            this.logger.error(
                `[pending-storage-debug] Failed to cache dataset. OperationId: ${operationId}, error: ${error.message}`,
            );
            throw error;
        }
    }

    async getCachedDataset(operationId) {
        this.logger.debug(`Retrieving cached dataset for ${operationId} from pending storage`);

        const filePath = this.fileService.getPendingStorageDocumentPath(operationId);

        this.logger.debug(
            `[pending-storage-debug] Reading cached dataset. OperationId: ${operationId}, path: ${filePath}`,
        );

        try {
            const fileContents = await this.fileService.readFile(filePath, true);

            // Log what we read
            const hasAssertion = fileContents?.assertion !== undefined;
            const assertionType = typeof fileContents?.assertion;
            const assertionSize = hasAssertion ? JSON.stringify(fileContents.assertion).length : 0;
            const isAssertionNull = fileContents?.assertion === null;
            const merkleRoot = fileContents?.merkleRoot;

            this.logger.debug(
                `[pending-storage-debug] Read cached dataset. OperationId: ${operationId}, has assertion: ${hasAssertion}, assertion type: ${assertionType}, isNull: ${isAssertionNull}, assertion size: ${assertionSize} bytes, merkleRoot: ${merkleRoot}`,
            );

            if (isAssertionNull) {
                this.logger.warn(
                    `[pending-storage-debug] Assertion is NULL in cached file! OperationId: ${operationId}, full file contents keys: [${Object.keys(
                        fileContents || {},
                    ).join(', ')}]`,
                );
            }

            return fileContents.assertion;
        } catch (error) {
            this.logger.error(
                `[pending-storage-debug] Failed to retrieve or parse cached dataset. OperationId: ${operationId}, path: ${filePath}, error: ${error.message}, stack: ${error.stack}`,
            );
            throw error;
        }
    }

    async removeExpiredFileCache(expirationTimeMillis, maxRemovalCount) {
        this.logger.debug(
            `Cleaning up expired files older than ${expirationTimeMillis} milliseconds. Max removal: ${maxRemovalCount}`,
        );

        const now = Date.now();
        let removedCount = 0;

        try {
            // Define the paths to the directories we want to clean
            const storagePaths = [
                this.fileService.getPendingStorageCachePath(),
                this.fileService.getSignatureStorageFolderPath(NETWORK_SIGNATURES_FOLDER),
                this.fileService.getSignatureStorageFolderPath(PUBLISHER_NODE_SIGNATURES_FOLDER),
            ];

            const filesToDelete = [];

            // Function to collect files from the provided base path
            const collectFiles = async (basePath) => {
                if (!(await this.fileService.pathExists(basePath))) {
                    this.logger.warn(`Storage path does not exist: ${basePath}`);
                    return;
                }

                const files = await this.fileService.readDirectory(basePath);

                // Add all files found in the directory to the filesToDelete array
                files.forEach((file) => {
                    filesToDelete.push({ file, basePath });
                });
            };

            // Collect files from both storage paths
            for (const basePath of storagePaths) {
                // eslint-disable-next-line no-await-in-loop
                await collectFiles(basePath);
            }

            // Function to delete an expired file
            const deleteFile = async ({ file, basePath }) => {
                const filePath = path.join(basePath, file);
                this.logger.debug(`Attempting to delete file: ${filePath}`);

                try {
                    const fileStats = await this.fileService.stat(filePath);
                    this.logger.debug(`File stats for ${filePath}: ${JSON.stringify(fileStats)}`);

                    const createdDate = fileStats.mtime;
                    if (createdDate.getTime() + expirationTimeMillis < now) {
                        await this.fileService.removeFile(filePath);
                        this.logger.debug(`Deleted expired file: ${filePath}`);
                        return true;
                    }
                } catch (fileError) {
                    this.logger.warn(`Failed to process file ${filePath}: ${fileError.message}`);
                }
                return false;
            };

            // Process files in batches
            for (let i = 0; i < filesToDelete.length; i += maxRemovalCount) {
                const batch = filesToDelete.slice(i, i + maxRemovalCount);

                // eslint-disable-next-line no-await-in-loop
                const deletionResults = await Promise.allSettled(batch.map(deleteFile));

                removedCount += deletionResults.filter(
                    (result) => result.status === 'fulfilled' && result.value,
                ).length;

                if (removedCount >= maxRemovalCount) {
                    this.logger.debug(`Reached max removal count: ${maxRemovalCount}`);
                    return removedCount;
                }
            }
        } catch (error) {
            this.logger.error(`Error during file cleanup: ${error.message}`);
            throw error;
        }

        this.logger.debug(`Total files removed: ${removedCount}`);
        return removedCount;
    }

    async getCachedAssertion(repository, blockchain, contract, tokenId, assertionId, operationId) {
        const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);

        this.logger.debug(
            `Reading cached assertion for ual: ${ual}, assertion id: ${assertionId}, operation id: ${operationId} from file in ${repository} pending storage`,
        );
        try {
            const documentPath = await this.fileService.getPendingStorageDocumentPath(operationId);

            const data = await this.fileService.readFile(documentPath, true);
            return data;
        } catch (error) {
            this.logger.debug(
                `Assertion not found in ${repository} pending storage. Error message: ${error.message}, ${error.stackTrace}`,
            );
            return null;
        }
    }

    async removeCachedAssertion(repository, blockchain, contract, tokenId, operationId) {
        const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);

        this.logger.debug(
            `Removing cached assertion for ual: ${ual} operation id: ${operationId} from file in ${repository} pending storage`,
        );

        const pendingAssertionPath = await this.fileService.getPendingStorageDocumentPath(
            operationId,
        );
        await this.fileService.removeFile(pendingAssertionPath);

        const pendingStorageFolderPath = this.fileService.getParentDirectory(pendingAssertionPath);

        try {
            const otherPendingAssertions = await this.fileService.readDirectory(
                pendingStorageFolderPath,
            );
            if (otherPendingAssertions.length === 0) {
                await this.fileService.removeFolder(pendingStorageFolderPath);
            }
        } catch (error) {
            this.logger.debug(
                `Assertions folder not found in ${repository} pending storage. ` +
                    `Error message: ${error.message}, ${error.stackTrace}`,
            );
        }
    }

    async getPendingState(operationId) {
        return this.fileService.getPendingStorageLatestDocument(operationId);
    }
}

export default PendingStorageService;
