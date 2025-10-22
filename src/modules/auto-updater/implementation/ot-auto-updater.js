import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import https from 'https';
import appRootPath from 'app-root-path';
import semver from 'semver';
import axios from 'axios';
import unzipper from 'unzipper';

const REPOSITORY_URL = 'https://github.com/OriginTrail/dkg-engine';
const ARCHIVE_REPOSITORY_URL = 'github.com/OriginTrail/dkg-engine/archive/';

class OTAutoUpdater {
    async initialize(config, logger) {
        this.config = config;
        this.logger = logger;
        if (!this.config) throw Error('You must pass a config object to AutoUpdater.');
        if (!this.config.branch) this.config.branch = 'master';
    }

    async compareVersions() {
        try {
            this.logger.debug('AutoUpdater - Comparing versions...');
            const currentVersion = await this.readAppVersion(appRootPath.path);
            const remoteVersion = await this.readRemoteVersion();
            this.logger.debug(`AutoUpdater - Current version: ${currentVersion}`);
            this.logger.debug(`AutoUpdater - Remote Version: ${remoteVersion}`);
            if (currentVersion === remoteVersion) {
                return {
                    upToDate: true,
                    currentVersion,
                };
            }
            return {
                upToDate: false,
                currentVersion,
                remoteVersion,
            };
        } catch (e) {
            this.logger.error(
                `AutoUpdater - Error comparing local and remote versions. Error message: ${e.message}`,
            );
            return {
                upToDate: false,
                currentVersion: 'Error',
                remoteVersion: 'Error',
            };
        }
    }

    async update() {
        try {
            this.logger.debug(`AutoUpdater - Updating dkg-engine from ${REPOSITORY_URL}`);
            const currentDirectory = appRootPath.path;
            const rootPath = path.join(currentDirectory, '..');

            const currentVersion = await this.readAppVersion(currentDirectory);
            const newVersion = await this.readRemoteVersion();
            const updateDirectory = path.join(rootPath, newVersion);
            const zipArchiveDestination = `${updateDirectory}.zip`;
            const tmpExtractionPath = path.join(rootPath, 'TmpExtractionPath');
            await this.downloadUpdate(zipArchiveDestination);
            await this.unzipFile(tmpExtractionPath, zipArchiveDestination);
            await this.moveAndCleanExtractedData(tmpExtractionPath, updateDirectory);
            await this.copyConfigFiles(currentDirectory, updateDirectory);
            await this.installDependencies(updateDirectory);

            const currentSymlinkFolder = path.join(rootPath, 'current');
            if (await fs.pathExists(currentSymlinkFolder)) {
                await fs.remove(currentSymlinkFolder);
            }
            await fs.ensureSymlink(updateDirectory, currentSymlinkFolder);

            this.logger.debug('AutoUpdater - Finished installing updated version.');

            await this.removeOldVersions(currentVersion, newVersion);
            return true;
        } catch (e) {
            this.logger.error(`AutoUpdater - Error updating application. Error message: ${e}`);
            return false;
        }
    }

    async removeOldVersions(currentVersion, newVersion) {
        try {
            const rootPath = path.join(appRootPath.path, '..');

            const oldVersionsDirs = (await fs.promises.readdir(rootPath, { withFileTypes: true }))
                .filter((dirent) => dirent.isDirectory())
                .map((dirent) => dirent.name)
                .filter(
                    (name) => semver.valid(name) && name !== newVersion && name !== currentVersion,
                );
            const deletePromises = oldVersionsDirs
                .map((dirName) => path.join(rootPath, dirName))
                .map((fullPath) => fs.promises.rm(fullPath, { recursive: true, force: true }));

            await Promise.all(deletePromises);
        } catch (e) {
            throw Error('AutoUpdater - There was an error removing old versions');
        }
    }

    /**
     * Copies user config files to destination directory
     */
    async copyConfigFiles(source, destination) {
        this.logger.debug('AutoUpdater - Copying config files...');
        this.logger.debug(`AutoUpdater - Destination: ${destination}`);

        await fs.ensureDir(destination);

        const envFilePath = path.join(source, '.env');
        const newEnvFilePath = path.join(destination, '.env');
        await fs.copy(envFilePath, newEnvFilePath);
    }

    /**
     * Reads the applications version from the package.json file.
     */
    async readAppVersion(appPath) {
        const file = path.join(appPath, 'package.json');
        this.logger.debug(`AutoUpdater - Reading app version from ${file}`);
        const appPackage = await fs.promises.readFile(file);
        return JSON.parse(appPackage).version;
    }

    /**
     * A promise wrapper for sending a get https requests.
     * @param {String} url - The Https address to request.
     * @param {String} options - The request options.
     */
    promiseHttpsRequest(url, options) {
        return new Promise((resolve, reject) => {
            const req = https.request(url, options, (res) => {
                let body = '';
                res.on('data', (data) => {
                    body += data;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) return resolve(body);
                    this.logger.warn(`AutoUpdater - Bad Response ${res.statusCode}`);
                    reject(res.statusCode);
                });
            });
            this.logger.debug(`AutoUpdater - Sending request to ${url}`);
            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Reads the applications version from the git repository.
     */
    async readRemoteVersion() {
        const options = {};
        let url = `${REPOSITORY_URL}/${this.config.branch}/package.json`;
        if (url.includes('github')) url = url.replace('github.com', 'raw.githubusercontent.com');
        this.logger.debug(`AutoUpdater - Reading remote version from ${url}`);

        try {
            const body = await this.promiseHttpsRequest(url, options);
            const remotePackage = JSON.parse(body);
            const { version } = remotePackage;
            return version;
        } catch (e) {
            throw Error(
                `This repository requires a token or does not exist. Error message: ${e.message}`,
            );
        }
    }

    downloadUpdate(destination) {
        return new Promise((resolve, reject) => {
            const url = `https://${path.join(ARCHIVE_REPOSITORY_URL, this.config.branch)}.zip`;
            this.logger.debug(`AutoUpdater - Downloading dkg-engine .zip file from url: ${url}`);
            axios({ method: 'get', url, responseType: 'stream' })
                .then((response) => {
                    const fileStream = fs.createWriteStream(destination);
                    response.data.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close(); // close() is async, call cb after close completes.
                        resolve();
                    });
                    fileStream.on('error', (err) => {
                        // Handle errors
                        fs.unlinkSync(destination);
                        reject(err);
                    });
                })
                .catch((error) => {
                    reject(
                        Error(
                            `AutoUpdater - Unable to download new version of dkg-engine. Error: ${error.message}`,
                        ),
                    );
                });
        });
    }

    unzipFile(destination, source) {
        this.logger.debug(`AutoUpdater - Unzipping dkg-engine new version archive`);
        return new Promise((resolve, reject) => {
            const fileReadStream = fs
                .createReadStream(source)
                .pipe(unzipper.Extract({ path: destination }));
            fileReadStream.on('close', () => {
                this.logger.debug(`AutoUpdater - Unzip completed`);
                fs.removeSync(source);
                resolve();
            });
            fileReadStream.on('error', (err) => {
                reject(err);
            });
        });
    }

    async moveAndCleanExtractedData(extractedDataPath, destinationPath) {
        this.logger.debug(`AutoUpdater - Cleaning update destination directory`);
        const destinationDirFiles = await fs.readdir(extractedDataPath);
        if (destinationDirFiles.length !== 1) {
            await fs.remove(extractedDataPath);
            throw Error('Extracted archive for new dkg-engine version is not valid');
        }
        const sourcePath = path.join(extractedDataPath, destinationDirFiles[0]);
        await fs.remove(destinationPath);
        await fs.move(sourcePath, destinationPath);

        await fs.remove(extractedDataPath);
    }

    /**
     * Runs npm install to update/install the application dependencies.
     */
    installDependencies(destination) {
        return new Promise((resolve, reject) => {
            this.logger.debug(
                `AutoUpdater - Installing application dependencies in ${destination}`,
            );

            const command = `cd ${destination} && npm ci --omit=dev --ignore-scripts`;
            const child = exec(command);
            let rejected = false;
            child.stdout.on('data', (data) => {
                this.logger.trace(`AutoUpdater - npm ci - ${data.replace(/\r?\n|\r/g, '')}`);
            });

            child.stderr.on('data', (data) => {
                if (data.includes('ERROR')) {
                    this.logger.trace(`Error message: ${data}`);
                    // npm passes warnings as errors, only reject if "error" is included
                    const errorData = data.replace(/\r?\n|\r/g, '');
                    this.logger.error(
                        `AutoUpdater - Error installing dependencies. Error message: ${errorData}`,
                    );
                    if (!rejected) {
                        rejected = true;
                        reject(errorData);
                    }
                }
            });
            child.stdout.on('end', () => {
                if (!rejected) {
                    this.logger.debug(`AutoUpdater - Dependencies installed successfully`);
                    resolve();
                }
            });
        });
    }
}

export default OTAutoUpdater;
