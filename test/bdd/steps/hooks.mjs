import 'dotenv/config';
import { Before, BeforeAll, After, AfterAll } from '@cucumber/cucumber';
import slugify from 'slugify';
import fs from 'fs';
import mysql from 'mysql2';
import { NODE_ENVIRONMENTS } from '../../../src/constants/constants.js';
import TripleStoreModuleManager from '../../../src/modules/triple-store/triple-store-module-manager.js';

process.env.NODE_ENV = NODE_ENVIRONMENTS.TEST;

BeforeAll(() => {});

Before(function beforeMethod(testCase) {
    this.logger = console;
    this.logger.log('\n🟡 Starting scenario:', testCase.pickle.name);
    // Initialize variables
    this.state = {};
    this.state.localBlockchain = null;
    this.state.localBlockchains = [];
    this.state.nodes = {};
    this.state.bootstraps = [];
    let logDir = process.env.CUCUMBER_ARTIFACTS_DIR || '.';
    logDir += `/test/bdd/log/${slugify(testCase.pickle.name)}`;
    fs.mkdirSync(logDir, { recursive: true });
    this.state.scenarionLogDir = logDir;
    this.logger.log('📁 Scenario logs:', logDir);
});

After({ timeout: 30000 }, async function afterMethod(testCase) {
    const tripleStoreConfiguration = [];
    const databaseNames = [];
    const cleanupPromises = [];

    // Stop all nodes first and wait for them to shut down
    const stopPromises = [];
    
    for (const key in this.state.nodes) {
        const node = this.state.nodes[key];
        if (node.forkedNode) {
            node.forkedNode.kill();
        } else if (node.otNodeInstance?.stop) {
            stopPromises.push(node.otNodeInstance.stop());
        }

        tripleStoreConfiguration.push({
            modules: { tripleStore: node.configuration.modules.tripleStore },
        });
        databaseNames.push(node.configuration.operationalDatabase.databaseName);
        const dataFolderPath = node.fileService.getDataFolderPath();
        cleanupPromises.push(node.fileService.removeFolder(dataFolderPath));
    }

    for (const node of this.state.bootstraps) {
        if (node.forkedNode) {
            node.forkedNode.kill();
        } else if (node.otNodeInstance?.stop) {
            stopPromises.push(node.otNodeInstance.stop());
        }

        tripleStoreConfiguration.push({
            modules: { tripleStore: node.configuration.modules.tripleStore },
        });
        databaseNames.push(node.configuration.operationalDatabase.databaseName);
        const dataFolderPath = node.fileService.getDataFolderPath();
        cleanupPromises.push(node.fileService.removeFolder(dataFolderPath));
    }

    // Wait for all nodes to stop before continuing
    this.logger.log('⏸️ Stopping all nodes...');
    await Promise.all(stopPromises);
    this.logger.log('✅ All nodes stopped');
    
    // Give a moment for ports to be fully released
    await new Promise(resolve => setTimeout(resolve, 500));

    for (const localBlockchain in this.state.localBlockchains) {
        this.logger.info(`🛑 Stopping local blockchain ${localBlockchain}`);
        cleanupPromises.push(this.state.localBlockchains[localBlockchain].stop());
        this.state.localBlockchains[localBlockchain] = null;
    }

    this.logger.log('🧹 Cleaning up repositories and databases...');
    const con = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: process.env.REPOSITORY_PASSWORD,
    });

    for (const db of databaseNames) {
        const sql = `DROP DATABASE IF EXISTS \`${db}\`;`;
        cleanupPromises.push(con.promise().query(sql));
    }

    for (const config of tripleStoreConfiguration) {
        // Skip if tripleStore module is not defined
        if (!config?.modules?.tripleStore) {
            continue;
        }
        
        cleanupPromises.push((async () => {
            try {
                const tripleStoreModuleManager = new TripleStoreModuleManager({
                    config,
                    logger: this.logger,
                });
                await tripleStoreModuleManager.initialize();
                for (const impl of tripleStoreModuleManager.getImplementationNames()) {
                    const { tripleStoreConfig } = tripleStoreModuleManager.getImplementation(impl);
                    for (const repo of Object.keys(tripleStoreConfig.repositories)) {
                        this.logger.log('🗑 Removing triple store repository:', repo);
                        await tripleStoreModuleManager.deleteRepository(impl, repo);
                    }
                }
            } catch (error) {
                // Log but don't fail cleanup if tripleStore cleanup fails
                this.logger.warn(`⚠️ Could not clean up tripleStore: ${error.message}`);
            }
        })());
    }

    await Promise.all(cleanupPromises);
    con.end();

    this.logger.log('\n✅ Completed scenario:', testCase.pickle.name);
    this.logger.log(`📄 Location: ${testCase.gherkinDocument.uri}:${testCase.gherkinDocument.feature.location.line}`);
    this.logger.log(`🟢 Status: ${testCase.result.status}`);
    this.logger.log(`⏱ Duration: ${testCase.result.duration} milliseconds\n`);
});

AfterAll(async () => {});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.abort();
});
