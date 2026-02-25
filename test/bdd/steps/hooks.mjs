import 'dotenv/config';
import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import { Before, BeforeAll, After, AfterAll } from '@cucumber/cucumber';
import slugify from 'slugify';
import fs from 'fs';
import mysql from 'mysql2';
import { NODE_ENVIRONMENTS } from '../../../src/constants/constants.js';
import TripleStoreModuleManager from '../../../src/modules/triple-store/triple-store-module-manager.js';

/** Delay after killing node processes so the OS releases ports before the next scenario/retry. */
const PORT_RELEASE_DELAY_MS = 2500;

process.env.NODE_ENV = NODE_ENVIRONMENTS.TEST;

BeforeAll(() => {});

Before(async function beforeMethod(testCase) {
    this.logger = console;
    this.logger.log('\n🟡 Starting scenario:', testCase.pickle.name);

    this.state = {
        localBlockchains: {},
        nodes: {},
        bootstraps: [],
        pendingProcesses: [],
    };

    // Flush Redis to remove stale BullMQ queues/jobs from prior scenarios.
    // Each node uses a per-node queue name (command-executor-node0, etc.); without
    // flushing, old job schedulers and pending jobs survive across scenarios.
    try {
        execSync('redis-cli FLUSHALL', { stdio: 'ignore' });
    } catch {
        // Non-fatal: Redis may not have stale data
    }

    // Drop stale databases from prior crashed runs so nodes start clean on first attempt
    try {
        const con = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: process.env.REPOSITORY_PASSWORD,
        });
        const staleDbNames = [
            'operationaldbbootstrap',
            ...Array.from({ length: 10 }, (_, i) => `operationaldbnode${i}`),
        ];
        for (const db of staleDbNames) {
            await con.promise().query(`DROP DATABASE IF EXISTS \`${db}\`;`);
        }
        con.end();
    } catch {
        // Non-fatal: node will attempt to create the DB itself
    }

    let logDir = process.env.CUCUMBER_ARTIFACTS_DIR || '.';
    logDir += `/test/bdd/log/${slugify(testCase.pickle.name)}`;
    fs.mkdirSync(logDir, { recursive: true });
    this.state.scenarionLogDir = logDir;
    this.logger.log('📁 Scenario logs:', logDir);
});

After({ timeout: 60000 }, async function afterMethod(testCase) {
    const tripleStoreConfiguration = [];
    const databaseNames = [];
    const promises = [];

    // SIGKILL all node processes so they are terminated immediately without waiting for
    // async cleanup that could hang (e.g. trying to close blockchain connections to an
    // already-stopped Hardhat instance). This guarantees all ports are released before
    // the next scenario (or retry) starts.
    for (const proc of this.state.pendingProcesses) {
        proc.kill('SIGKILL');
    }

    const allNodes = [...Object.values(this.state.nodes), ...this.state.bootstraps];
    for (const node of allNodes) {
        node.forkedNode.kill('SIGKILL');

        const tripleStoreModuleConfig = node.configuration.modules.tripleStore;
        const OT_BLAZEGRAPH_PACKAGE =
            './triple-store/implementation/ot-blazegraph/ot-blazegraph.js';
        const enabledTripleStore = {
            enabled: true,
            implementation: {},
        };
        for (const [implName, implConfig] of Object.entries(
            tripleStoreModuleConfig.implementation || {},
        )) {
            enabledTripleStore.implementation[implName] = {
                ...implConfig,
                enabled: true,
                package: implConfig.package || OT_BLAZEGRAPH_PACKAGE,
            };
        }
        tripleStoreConfiguration.push({
            appDataPath: node.configuration.appDataPath,
            modules: { tripleStore: enabledTripleStore },
        });
        databaseNames.push(node.configuration.operationalDatabase.databaseName);
        promises.push(node.fileService.removeFolder(node.fileService.getDataFolderPath()));
    }

    await setTimeout(PORT_RELEASE_DELAY_MS);

    for (const [blockchainId, blockchain] of Object.entries(this.state.localBlockchains)) {
        this.logger.log(`🛑 Stopping local blockchain ${blockchainId}`);
        promises.push(blockchain.stop());
    }

    this.logger.log('🧹 Cleaning up repositories and databases...');
    const con = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: process.env.REPOSITORY_PASSWORD,
    });

    for (const db of databaseNames) {
        const sql = `DROP DATABASE IF EXISTS \`${db}\`;`;
        promises.push(con.promise().query(sql));
    }

    for (const tsConfig of tripleStoreConfiguration) {
        promises.push(
            (async () => {
                const tripleStoreModuleManager = new TripleStoreModuleManager({
                    config: tsConfig,
                    logger: this.logger,
                });
                await tripleStoreModuleManager.initialize();
                for (const impl of tripleStoreModuleManager.getImplementationNames()) {
                    const { config: implConfig } =
                        tripleStoreModuleManager.getImplementation(impl);
                    if (!implConfig?.repositories) continue;
                    for (const repo of Object.keys(implConfig.repositories)) {
                        this.logger.log('🗑 Removing triple store repository:', repo);
                        await tripleStoreModuleManager.deleteRepository(impl, repo);
                    }
                }
            })(),
        );
    }

    await Promise.all(promises);
    con.end();

    this.logger.log('\n✅ Completed scenario:', testCase.pickle.name);
    this.logger.log(
        `📄 Location: ${testCase.gherkinDocument.uri}:${testCase.gherkinDocument.feature.location.line}`,
    );
    this.logger.log(`🟢 Status: ${testCase.result.status}`);
    const durationMs = testCase.result.duration
        ? (Number(testCase.result.duration.seconds) || 0) * 1000 +
          (Number(testCase.result.duration.nanos) || 0) / 1e6
        : 0;
    this.logger.log(`⏱ Duration: ${Math.round(durationMs)} ms\n`);
});

AfterAll(async () => {});

process.on('unhandledRejection', () => {
    process.abort();
});
