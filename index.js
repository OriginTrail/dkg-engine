/* eslint-disable no-console */
import 'dotenv/config';
import fs from 'fs-extra';
import OTNode from './ot-node.js';
import { NODE_ENVIRONMENTS } from './src/constants/constants.js';

process.env.NODE_ENV =
    process.env.NODE_ENV && Object.values(NODE_ENVIRONMENTS).includes(process.env.NODE_ENV)
        ? process.env.NODE_ENV
        : NODE_ENVIRONMENTS.DEVELOPMENT;

(async () => {
    let userConfig = null;
    try {
        if (process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT && process.argv.length === 3) {
            const configurationFilename = process.argv[2];
            userConfig = JSON.parse(await fs.promises.readFile(process.argv[2]));
            userConfig.configFilename = configurationFilename;
        }
    } catch (error) {
        console.log('Unable to read user configuration from file: ', process.argv[2]);
        process.exit(1);
    }
    try {
        const node = new OTNode(userConfig);
        await node.start();
    } catch (e) {
        console.error(`Error occurred while start ot-node, error message: ${e}. ${e.stack}`);
        // console.error(`Trying to recover from older version`);
        // if (process.env.NODE_ENV !== NODE_ENVIRONMENTS.DEVELOPMENT) {
        //     const rootPath = path.join(appRootPath.path, '..');
        //     const oldVersionsDirs = (await fs.promises.readdir(rootPath, { withFileTypes: true }))
        //         .filter((dirent) => dirent.isDirectory())
        //         .map((dirent) => dirent.name)
        //         .filter((name) => semver.valid(name) && !appRootPath.path.includes(name));
        //
        //     if (oldVersionsDirs.length === 0) {
        //         console.error(
        //             `Failed to start OT-Node, no backup code available. Error message: ${e.message}`,
        //         );
        //         process.exit(1);
        //     }
        //
        //     const oldVersion = oldVersionsDirs.sort(semver.compare).pop();
        //     const oldversionPath = path.join(rootPath, oldVersion);
        //     execSync(`ln -sfn ${oldversionPath} ${rootPath}/current`);
        //     await fs.promises.rm(appRootPath.path, { force: true, recursive: true });
        // }
        process.exit(1);
    }
})();

process.on('unhandledRejection', (err) => {
    // Handle specific libp2p peer lookup failures that escape try-catch blocks
    if (err && err.code === 'ERR_LOOKUP_FAILED') {
        console.warn(`Peer lookup failed (ERR_LOOKUP_FAILED): ${err.message}`);
        return; // Don't crash for peer lookup failures
    }

    // For all other unhandled rejections, crash the node
    console.error('Something went really wrong! OT-node shutting down...', err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Something went really wrong! OT-node shutting down...', err);
    process.exit(1);
});
