import os from 'os';
import path from 'path';
import {
    mkdir,
    writeFile,
    readFile,
    unlink,
    stat,
    readdir,
    rm,
    appendFile,
    chmod,
} from 'fs/promises';
import appRootPath from 'app-root-path';
import {
    BLS_KEY_DIRECTORY,
    BLS_KEY_FILENAME,
    MIGRATION_FOLDER,
    NODE_ENVIRONMENTS,
} from '../constants/constants.js';

class FileService {
    constructor(ctx) {
        this.config = ctx.config;
        this.logger = ctx.logger;
    }

    getFileExtension(filePath) {
        return path.extname(filePath).toLowerCase();
    }

    /**
     * Write contents to file
     * @param directory
     * @param filename
     * @param data
     * @returns {Promise}
     */
    async writeContentsToFile(directory, filename, data, log = true, flag = 'w') {
        if (log) {
            this.logger.debug(`Saving file with name: ${filename} in the directory: ${directory}`);
        }
        await mkdir(directory, { recursive: true });
        const fullpath = path.join(directory, filename);
        await writeFile(fullpath, data, { flag });
        return fullpath;
    }

    async appendContentsToFile(directory, filename, data, log = true) {
        if (log) {
            this.logger.debug(`Saving file with name: ${filename} in the directory: ${directory}`);
        }
        await mkdir(directory, { recursive: true });
        const fullPath = path.join(directory, filename);

        await appendFile(fullPath, data);

        return fullPath;
    }

    async readDirectory(dirPath) {
        this.logger.debug(`Reading folder at path: ${dirPath}`);
        try {
            return readdir(dirPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw Error(`Folder not found at path: ${dirPath}`);
            }
            throw error;
        }
    }

    async stat(filePath) {
        return stat(filePath);
    }

    async pathExists(fileOrDirPath) {
        try {
            await stat(fileOrDirPath);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return false;
            }
            throw error;
        }
    }

    async readFile(filePath, convertToJSON = false) {
        this.logger.debug(`Reading file: ${filePath}, converting to json: ${convertToJSON}`);
        try {
            const data = await readFile(filePath);
            return convertToJSON ? JSON.parse(data) : data.toString();
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw Error(`File not found at path: ${filePath}`);
            }
            throw error;
        }
    }

    async removeFile(filePath) {
        this.logger.trace(`Removing file at path: ${filePath}`);

        try {
            await unlink(filePath);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.debug(`File not found at path: ${filePath}`);
                return false;
            }
            throw error;
        }
    }

    async removeFolder(folderPath) {
        this.logger.debug(`Removing folder at path: ${folderPath}`);
        try {
            await rm(folderPath, { recursive: true });
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.debug(`Folder not found at path: ${folderPath}`);
                return false;
            }
            throw error;
        }
    }

    getBinariesFolderPath() {
        return path.join(appRootPath.path, 'bin');
    }

    getBinaryPath(binary) {
        let binaryName = binary;
        if (process.platform === 'win32') {
            binaryName += '.exe';
        }
        return path.join(this.getBinariesFolderPath(), process.platform, process.arch, binaryName);
    }

    async makeBinaryExecutable(binary) {
        const binaryPath = this.getBinaryPath(binary);
        if (os.platform() !== 'win32') {
            await chmod(binaryPath, '755', (err) => {
                if (err) {
                    throw err;
                }
                this.logger.debug(`Permissions for binary ${binaryPath} have been set to 755.`);
            });
        }
    }

    getBLSSecretKeyFolderPath() {
        return path.join(this.getDataFolderPath(), BLS_KEY_DIRECTORY);
    }

    getBLSSecretKeyPath() {
        return path.join(this.getBLSSecretKeyFolderPath(), BLS_KEY_FILENAME);
    }

    getDataFolderPath() {
        // Support for external data path
        if (process.env.OT_NODE_DATA_PATH) {
            return process.env.OT_NODE_DATA_PATH;
        }

        if (
            process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVNET ||
            process.env.NODE_ENV === NODE_ENVIRONMENTS.TESTNET ||
            process.env.NODE_ENV === NODE_ENVIRONMENTS.MAINNET
        ) {
            return path.join(appRootPath.path, '..', this.config.appDataPath);
        }
        return path.join(appRootPath.path, this.config.appDataPath);
    }

    getUpdateFilePath() {
        return path.join(this.getDataFolderPath(), 'UPDATED');
    }

    getMigrationFolderPath() {
        return path.join(this.getDataFolderPath(), MIGRATION_FOLDER);
    }

    getOperationIdCachePath() {
        return path.join(this.getDataFolderPath(), 'operation_id_cache');
    }

    getOperationIdDocumentPath(operationId) {
        return path.join(this.getOperationIdCachePath(), operationId);
    }

    getPendingStorageCachePath() {
        return path.join(this.getDataFolderPath(), 'pending_storage_cache');
    }

    getPendingStorageDocumentPath(operationId) {
        return path.join(this.getPendingStorageCachePath(), operationId);
    }

    getSignatureStorageCachePath() {
        return path.join(this.getDataFolderPath(), 'signature_storage_cache');
    }

    getSignatureStorageFolderPath(folderName) {
        return path.join(this.getSignatureStorageCachePath(), folderName);
    }

    getSignatureStorageDocumentPath(folderName, operationId) {
        return path.join(this.getSignatureStorageFolderPath(folderName), operationId);
    }

    getParentDirectory(filePath) {
        return path.dirname(filePath);
    }
}

export default FileService;
