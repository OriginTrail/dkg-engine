import DeepExtend from 'deep-extend';
import rc from 'rc';
import EventEmitter from 'events';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import DependencyInjection from './src/service/dependency-injection.js';
import Logger from './src/logger/logger.js';
import { MIN_NODE_VERSION, PARANET_ACCESS_POLICY } from './src/constants/constants.js';
import FileService from './src/service/file-service.js';
import OtnodeUpdateCommand from './src/commands/common/otnode-update-command.js';
import OtAutoUpdater from './src/modules/auto-updater/implementation/ot-auto-updater.js';
import MigrationExecutor from './src/migration/migration-executor.js';

const require = createRequire(import.meta.url);
const { setTimeout } = require('timers/promises');
const pjson = require('./package.json');
const configjson = require('./config/config.json');

class OTNode {
    constructor(config) {
        this.initializeConfiguration(config);
        this.initializeLogger();
        this.initializeFileService();
        this.initializeAutoUpdaterModule();
        this.checkNodeVersion();
    }

    async start() {
        await this.checkForUpdate();
        await this.removeUpdateFile();

        await MigrationExecutor.executeTripleStoreUserConfigurationMigration(
            this.container,
            this.logger,
            this.config,
        );

        this.logger.info('██████╗ ██╗  ██╗ ██████╗     ██╗   ██╗ █████╗ ');
        this.logger.info('██╔══██╗██║ ██╔╝██╔════╝     ██║   ██║██╔══██╗');
        this.logger.info('██║  ██║█████╔╝ ██║  ███╗    ██║   ██║╚█████╔╝');
        this.logger.info('██║  ██║██╔═██╗ ██║   ██║    ╚██╗ ██╔╝██╔══██╗');
        this.logger.info('██████╔╝██║  ██╗╚██████╔╝     ╚████╔╝ ╚█████╔╝');
        this.logger.info('╚═════╝ ╚═╝  ╚═╝ ╚═════╝       ╚═══╝   ╚════╝ ');

        this.logger.info('======================================================');
        this.logger.info(`             OriginTrail Node v${pjson.version}`);
        this.logger.info('======================================================');
        this.logger.info(`Node is running in ${process.env.NODE_ENV} environment`);

        await this.initializeDependencyContainer();
        this.initializeEventEmitter();
        await this.initializeModules();
        this.initializeBlockchainEventsService();
        await this.initializeShardingTableService();
        await this.initializeParanets();

        await this.createProfiles();

        await this.initializeCommandExecutor();

        await this.initializeRouters();
        await this.startNetworkModule();
        this.resumeCommandExecutor();
        // await this.initializeProofing();
        this.logger.info('Node is up and running!');
    }

    checkNodeVersion() {
        const nodeMajorVersion = process.versions.node.split('.')[0];
        this.logger.warn('======================================================');
        this.logger.warn(`Using node.js version: ${process.versions.node}`);
        if (nodeMajorVersion < MIN_NODE_VERSION) {
            this.logger.warn(
                `This node was tested with node.js version 16. To make sure that your node is running properly please update your node version!`,
            );
        }
        this.logger.warn('======================================================');
    }

    initializeLogger() {
        this.logger = new Logger(this.config.logLevel);
    }

    initializeFileService() {
        this.fileService = new FileService({ config: this.config, logger: this.logger });
    }

    initializeAutoUpdaterModule() {
        this.autoUpdaterModuleManager = new OtAutoUpdater();
        this.autoUpdaterModuleManager.initialize(
            this.config.modules.autoUpdater.implementation['ot-auto-updater'].config,
            this.logger,
        );
    }

    initializeConfiguration(userConfig) {
        const defaultConfig = JSON.parse(JSON.stringify(configjson[process.env.NODE_ENV]));

        if (userConfig) {
            this.config = DeepExtend(defaultConfig, userConfig);
        } else {
            this.config = rc(pjson.name, defaultConfig);
        }
        if (!this.config.configFilename) {
            // set default user configuration filename
            this.config.configFilename = '.origintrail_noderc';
        }
    }

    async initializeDependencyContainer() {
        this.container = await DependencyInjection.initialize();
        DependencyInjection.registerValue(this.container, 'config', this.config);
        DependencyInjection.registerValue(this.container, 'logger', this.logger);

        this.logger.info('Dependency injection module is initialized');
    }

    async initializeModules() {
        const initializationPromises = [];
        for (const moduleName in this.config.modules) {
            const moduleManagerName = `${moduleName}ModuleManager`;

            const moduleManager = this.container.resolve(moduleManagerName);
            initializationPromises.push(moduleManager.initialize());
        }
        try {
            await Promise.all(initializationPromises);
            this.logger.info(`All modules initialized!`);
        } catch (e) {
            this.logger.error(`Module initialization failed. Error message: ${e.message}`);
            this.stop(1);
        }
    }

    initializeEventEmitter() {
        const eventEmitter = new EventEmitter();
        DependencyInjection.registerValue(this.container, 'eventEmitter', eventEmitter);

        this.logger.info('Event emitter initialized');
    }

    async initializeRouters() {
        try {
            this.logger.info('Initializing http api and rpc router');

            const routerNames = ['httpApiRouter', 'rpcRouter'];
            await Promise.all(
                routerNames.map(async (routerName) => {
                    const router = this.container.resolve(routerName);
                    try {
                        await router.initialize();
                    } catch (error) {
                        this.logger.error(
                            `${routerName} initialization failed. Error message: ${error.message}, ${error.stackTrace}`,
                        );
                        this.stop(1);
                    }
                }),
            );
            this.logger.info('Routers initialized successfully');
        } catch (error) {
            this.logger.error(
                `Failed to initialize routers: ${error.message}, ${error.stackTrace}`,
            );
            this.stop(1);
        }
    }

    async createProfiles() {
        const cryptoService = this.container.resolve('cryptoService');
        const blockchainModuleManager = this.container.resolve('blockchainModuleManager');
        const networkModuleManager = this.container.resolve('networkModuleManager');
        const peerId = networkModuleManager.getPeerId().toB58String();
        const createProfilesPromises = blockchainModuleManager
            .getImplementationNames()
            .map(async (blockchain) => {
                try {
                    const identityExists = await blockchainModuleManager.identityIdExists(
                        blockchain,
                    );
                    if (!identityExists) {
                        this.logger.info(`Creating profile on network: ${blockchain}`);
                        await blockchainModuleManager.createProfile(blockchain, peerId);

                        if (
                            process.env.NODE_ENV === 'development' ||
                            process.env.NODE_ENV === 'test'
                        ) {
                            const blockchainConfig =
                                blockchainModuleManager.getModuleConfiguration(blockchain);
                            execSync(
                                `npm run set-stake -- --rpcEndpoint=${blockchainConfig.rpcEndpoints[0]} --stake=${blockchainConfig.initialStakeAmount} --operationalWalletPrivateKey=${blockchainConfig.operationalWallets[0].privateKey} --managementWalletPrivateKey=${blockchainConfig.evmManagementWalletPrivateKey} --hubContractAddress=${blockchainConfig.hubContractAddress}`,
                                { stdio: 'inherit' },
                            );
                            await setTimeout(10000);
                            execSync(
                                `npm run set-ask -- --rpcEndpoint=${blockchainConfig.rpcEndpoints[0]} --ask=${blockchainConfig.initialAskAmount} --privateKey=${blockchainConfig.operationalWallets[0].privateKey} --hubContractAddress=${blockchainConfig.hubContractAddress}`,
                                { stdio: 'inherit' },
                            );
                        }
                    }

                    const identityId = await blockchainModuleManager.getIdentityId(blockchain);

                    this.logger.info(`Identity ID: ${identityId}`);

                    if (identityExists) {
                        const onChainNodeId = await blockchainModuleManager.getNodeId(
                            blockchain,
                            identityId,
                        );
                        const onChainPeerId = cryptoService.convertHexToAscii(onChainNodeId);

                        if (peerId !== onChainPeerId) {
                            this.logger.warn(
                                `Local peer id: ${peerId} doesn't match on chain peer id: ${onChainPeerId} for blockchain: ${blockchain}, identity id: ${identityId}.`,
                            );
                            blockchainModuleManager.removeImplementation(blockchain);
                        }
                    }
                } catch (error) {
                    this.logger.warn(
                        `Unable to create ${blockchain} blockchain profile. Removing implementation. Error: ${error.message}`,
                    );
                    blockchainModuleManager.removeImplementation(blockchain);
                }
            });

        await Promise.all(createProfilesPromises);

        if (!blockchainModuleManager.getImplementationNames().length) {
            this.logger.error(`Unable to create blockchain profiles. OT-node shutting down...`);
            this.stop(1);
        }
    }

    async initializeCommandExecutor() {
        try {
            const commandExecutor = this.container.resolve('commandExecutor');
            commandExecutor.pauseQueue();
            await commandExecutor.addDefaultCommands();
            commandExecutor
                .replayOldCommands()
                .then(() => this.logger.info('Finished replaying old commands'));
        } catch (e) {
            this.logger.error(
                `Command executor initialization failed. Error message: ${e.message}`,
            );
            this.stop(1);
        }
    }

    resumeCommandExecutor() {
        try {
            const commandExecutor = this.container.resolve('commandExecutor');
            commandExecutor.resumeQueue();
        } catch (e) {
            this.logger.error(
                `Unable to resume command executor queue. Error message: ${e.message}`,
            );
            this.stop(1);
        }
    }

    async startNetworkModule() {
        const networkModuleManager = this.container.resolve('networkModuleManager');
        await networkModuleManager.start();
    }

    async initializeShardingTableService() {
        try {
            const shardingTableService = this.container.resolve('shardingTableService');
            await shardingTableService.initialize();
            this.logger.info('Sharding Table Service initialized successfully');
        } catch (error) {
            this.logger.error(
                `Unable to initialize sharding table service. Error message: ${error.message} OT-node shutting down...`,
            );
            this.stop(1);
        }
    }

    initializeBlockchainEventsService() {
        try {
            const blockchainEventsService = this.container.resolve('blockchainEventsService');
            blockchainEventsService.initializeBlockchainEventsServices();
            this.logger.info('Blockchain Events Service initialized successfully');
        } catch (error) {
            this.logger.error(
                `Unable to initialize Blockchain Events Service. Error message: ${error.message} OT-node shutting down...`,
            );
            this.stop(1);
        }
    }

    async removeUpdateFile() {
        const updateFilePath = this.fileService.getUpdateFilePath();
        await this.fileService.removeFile(updateFilePath).catch((error) => {
            this.logger.warn(`Unable to remove update file. Error: ${error}`);
        });
        this.config.otNodeUpdated = true;
    }

    async checkForUpdate() {
        const autoUpdaterCommand = new OtnodeUpdateCommand({
            logger: this.logger,
            config: this.config,
            fileService: this.fileService,
            autoUpdaterModuleManager: this.autoUpdaterModuleManager,
        });

        await autoUpdaterCommand.execute();
    }

    async initializeParanets() {
        const blockchainModuleManager = this.container.resolve('blockchainModuleManager');
        const tripleStoreService = this.container.resolve('tripleStoreService');
        const tripleStoreModuleManager = this.container.resolve('tripleStoreModuleManager');
        const paranetService = this.container.resolve('paranetService');
        const ualService = this.container.resolve('ualService');
        const validParanets = [];

        const syncParanets =
            this.config.assetSync && this.config.assetSync.syncParanets
                ? this.config.assetSync.syncParanets
                : [];
        for (const paranetUAL of syncParanets) {
            if (!ualService.isUAL(paranetUAL)) {
                this.logger.warn(
                    `Unable to initialize Paranet with id ${paranetUAL} because of invalid UAL format`,
                );
                continue;
            }

            const { blockchain, contract, knowledgeCollectionId, knowledgeAssetId } =
                ualService.resolveUAL(paranetUAL);

            if (!knowledgeAssetId) {
                this.logger.warn(
                    `Invalid paranet UAL: ${paranetUAL} . Knowledge asset token id is required!`,
                );
                continue;
            }
            if (!blockchainModuleManager.getImplementationNames().includes(blockchain)) {
                this.logger.warn(
                    `Unable to initialize Paranet with id ${paranetUAL} because of unsupported blockchain implementation`,
                );
                continue;
            }

            const paranetId = paranetService.constructParanetId(
                contract,
                knowledgeCollectionId,
                knowledgeAssetId,
            );
            // eslint-disable-next-line no-await-in-loop
            const paranetExists = await blockchainModuleManager.paranetExists(
                blockchain,
                paranetId,
            );
            if (!paranetExists) {
                this.logger.warn(
                    `Unable to initialize Paranet with id ${paranetUAL} because it doesn't exist`,
                );
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const nodesAccessPolicy = await blockchainModuleManager.getNodesAccessPolicy(
                blockchain,
                paranetId,
            );
            if (nodesAccessPolicy === PARANET_ACCESS_POLICY.PERMISSIONED) {
                // eslint-disable-next-line no-await-in-loop
                const identityId = await blockchainModuleManager.getIdentityId(blockchain);
                // eslint-disable-next-line no-await-in-loop
                const isPermissionedNode = await blockchainModuleManager.isPermissionedNode(
                    blockchain,
                    paranetId,
                    identityId,
                );
                if (!isPermissionedNode) {
                    this.logger.warn(
                        `Unable to initialize Paranet with id ${paranetUAL} because node with id ${identityId} is not a permissioned node`,
                    );
                    continue;
                }
            }

            validParanets.push(paranetUAL);
            const repository = paranetService.getParanetRepositoryName(paranetUAL);
            // eslint-disable-next-line no-await-in-loop
            await tripleStoreModuleManager.initializeParanetRepository(repository);
            // eslint-disable-next-line no-await-in-loop
            await paranetService.initializeParanetRecord(blockchain, paranetId);
        }
        this.config.assetSync.syncParanets = validParanets;
        tripleStoreService.initializeRepositories();
    }

    stop(code = 0) {
        this.logger.info('Stopping node...');
        process.exit(code);
    }
}

export default OTNode;
