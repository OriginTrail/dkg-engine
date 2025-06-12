import BaseController from '../base-http-api-controller.js';

import {
    OPERATION_ID_STATUS,
    TRIPLE_STORE_REPOSITORIES,
    QUERY_TYPES,
} from '../../../constants/constants.js';

class DirectQueryController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.config = ctx.config;
        this.fileService = ctx.fileService;
        this.dataService = ctx.dataService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.paranetService = ctx.paranetService;
        this.ualService = ctx.ualService;
        this.operationIdService = ctx.operationIdService;
    }

    async handleRequest(req, res) {
        const { type: queryType, paranetUAL } = req.body;
        let { query, repository } = req.body;

        let data;
        const operationId = await this.operationIdService.generateId();
        try {
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_INIT_START,
                operationId,
            );
            if (paranetUAL) {
                repository = this.paranetService.getParanetRepositoryName(paranetUAL);
            } else {
                let tripleStoreMigrationAlreadyExecuted = false;
                try {
                    // TODO: If triple store is migrated we should catch this and not check every time
                    tripleStoreMigrationAlreadyExecuted =
                        (await this.fileService.readFile(
                            '/root/ot-node/data/migrations/v8DataMigration',
                        )) === 'MIGRATED';
                } catch (e) {
                    this.logger.warn(`No triple store migration file error: ${e}`);
                }
                repository =
                    !tripleStoreMigrationAlreadyExecuted && repository
                        ? [repository, TRIPLE_STORE_REPOSITORIES.DKG]
                        : TRIPLE_STORE_REPOSITORIES.DKG;
            }

            const pattern = /SERVICE\s+<([^>]+)>/g;
            const matches = query.match(pattern);
            if (matches?.length > 0) {
                for (const match of matches) {
                    const repositoryInOriginalQuery = match.split('<')[1].split('>')[0];
                    const repositoryName = this.validateRepositoryName(repositoryInOriginalQuery);
                    const federatedQueryRepositoryEndpoint =
                        this.tripleStoreService.getRepositorySparqlEndpoint(repositoryName);
                    query = query.replace(
                        repositoryInOriginalQuery,
                        federatedQueryRepositoryEndpoint,
                    );
                }
            }
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_INIT_END,
                operationId,
            );
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_START,
                operationId,
            );
            switch (queryType) {
                case QUERY_TYPES.CONSTRUCT: {
                    if (Array.isArray(repository)) {
                        const [dataV6, dataV8] = await Promise.all([
                            this.tripleStoreService.construct(
                                query,
                                repository[0],
                                this.config.modules.tripleStore.timeout.query,
                            ),
                            this.tripleStoreService.construct(
                                query,
                                repository[1],
                                this.config.modules.tripleStore.timeout.query,
                            ),
                        ]);

                        data = this.dataService.removeDuplicateObjectsFromArray([
                            ...dataV6,
                            ...dataV8,
                        ]);
                    } else {
                        data = await this.tripleStoreService.construct(
                            query,
                            repository,
                            this.config.modules.tripleStore.timeout.query,
                        );
                    }

                    break;
                }
                case QUERY_TYPES.SELECT: {
                    if (Array.isArray(repository)) {
                        const [dataV6, dataV8] = await Promise.all([
                            this.tripleStoreService.select(
                                query,
                                repository[0],
                                this.config.modules.tripleStore.timeout.query,
                            ),
                            this.tripleStoreService.select(
                                query,
                                repository[1],
                                this.config.modules.tripleStore.timeout.query,
                            ),
                        ]);

                        data = this.dataService.removeDuplicateObjectsFromArray([
                            ...dataV6,
                            ...dataV8,
                        ]);
                    } else {
                        data = await this.tripleStoreService.select(
                            query,
                            repository,
                            this.config.modules.tripleStore.timeout.query,
                        );
                    }

                    break;
                }
                default:
                    this.returnResponse(res, 400, `Unknown query type ${queryType}`);
                    this.operationIdService.emitChangeEvent(
                        OPERATION_ID_STATUS.QUERY.QUERY_FAILED,
                        operationId,
                    );
                    return;
            }
        } catch (e) {
            this.returnResponse(res, 500, e.message);
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_FAILED,
                operationId,
            );
            return;
        }

        this.returnResponse(res, 200, {
            data,
        });
        this.operationIdService.emitChangeEvent(OPERATION_ID_STATUS.QUERY.QUERY_END, operationId);
    }

    validateRepositoryName(repository) {
        let isParanetRepoValid = false;
        if (this.ualService.isUAL(repository)) {
            const paranetRepoName = this.paranetService.getParanetRepositoryName(repository);
            isParanetRepoValid = this.config.assetSync?.syncParanets.includes(repository);
            if (isParanetRepoValid) {
                return paranetRepoName;
            }
        }
        const isTripleStoreRepoValid =
            Object.values(TRIPLE_STORE_REPOSITORIES).includes(repository);
        if (isTripleStoreRepoValid) {
            return repository;
        }

        if (!isParanetRepoValid && !isTripleStoreRepoValid) {
            throw new Error(`Query failed! Repository with name: ${repository} doesn't exist`);
        }
    }
}

export default DirectQueryController;
