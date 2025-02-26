import Command from '../command.js';
import {
    TRIPLE_STORE_REPOSITORIES,
    QUERY_TYPES,
    OPERATION_ID_STATUS,
    ERROR_TYPE,
} from '../../constants/constants.js';

class QueryCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.dataService = ctx.dataService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.paranetService = ctx.paranetService;
        this.ualService = ctx.ualService;

        this.errorType = ERROR_TYPE.QUERY.LOCAL_QUERY_ERROR;
    }

    async execute(command) {
        const { operationId, queryType, paranetUAL } = command.data;
        let { query, repository } = command.data;

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            null,
            OPERATION_ID_STATUS.QUERY.QUERY_START,
        );

        let data;

        if (paranetUAL) {
            repository = this.paranetService.getParanetRepositoryName(paranetUAL);
        }

        // TODO: Review federated query logic for V8

        // check if it's federated query
        const pattern = /SERVICE\s+<([^>]+)>/g;
        const matches = query.match(pattern);
        if (matches?.length > 0) {
            for (const match of matches) {
                const repositoryInOriginalQuery = match.split('<')[1].split('>')[0];
                const repositoryName = this.validateRepositoryName(repositoryInOriginalQuery);
                const federatedQueryRepositoryEndpoint =
                    this.tripleStoreService.getRepositorySparqlEndpoint(repositoryName);
                query = query.replace(repositoryInOriginalQuery, federatedQueryRepositoryEndpoint);
            }
        }

        try {
            switch (queryType) {
                case QUERY_TYPES.CONSTRUCT: {
                    this.operationIdService.emitChangeEvent(
                        OPERATION_ID_STATUS.QUERY.QUERY_CONSTRUCT_QUERY_START,
                        operationId,
                    );

                    if (Array.isArray(repository)) {
                        const dataV6 = await this.tripleStoreService.construct(
                            query,
                            repository[0],
                        );
                        const dataV8 = await this.tripleStoreService.construct(
                            query,
                            repository[1],
                        );

                        data = this.dataService.removeDuplicateObjectsFromArray([
                            ...dataV6,
                            ...dataV8,
                        ]);
                    } else {
                        data = await this.tripleStoreService.construct(query, repository);
                    }

                    this.operationIdService.emitChangeEvent(
                        OPERATION_ID_STATUS.QUERY.QUERY_CONSTRUCT_QUERY_END,
                        operationId,
                    );
                    break;
                }
                case QUERY_TYPES.SELECT: {
                    this.operationIdService.emitChangeEvent(
                        OPERATION_ID_STATUS.QUERY.QUERY_SELECT_QUERY_START,
                        operationId,
                    );

                    if (Array.isArray(repository)) {
                        const dataV6 = await this.tripleStoreService.select(query, repository[0]);
                        const dataV8 = await this.tripleStoreService.select(query, repository[1]);

                        data = this.dataService.removeDuplicateObjectsFromArray([
                            ...dataV6,
                            ...dataV8,
                        ]);
                    } else {
                        data = await this.tripleStoreService.select(query, repository);
                    }

                    this.operationIdService.emitChangeEvent(
                        OPERATION_ID_STATUS.QUERY.QUERY_SELECT_QUERY_END,
                        operationId,
                    );
                    break;
                }
                default:
                    throw new Error(`Unknown query type ${queryType}`);
            }

            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_CACHE_OPERATION_ID_DATA_TO_MEMORY_START,
                operationId,
            );
            await this.operationIdService.cacheOperationIdDataToMemory(operationId, data);
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_CACHE_OPERATION_ID_DATA_TO_MEMORY_END,
                operationId,
            );

            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_CACHE_OPERATION_ID_DATA_TO_FILE_START,
                operationId,
            );
            await this.operationIdService.cacheOperationIdDataToFile(operationId, data);
            this.operationIdService.emitChangeEvent(
                OPERATION_ID_STATUS.QUERY.QUERY_CACHE_OPERATION_ID_DATA_TO_FILE_END,
                operationId,
            );

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                null,
                OPERATION_ID_STATUS.QUERY.QUERY_END,
            );

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                null,
                OPERATION_ID_STATUS.COMPLETED,
            );
        } catch (e) {
            await this.handleError(operationId, null, e.message, this.errorType, true);
        }

        return Command.empty();
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

    /**
     * Builds default queryCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'queryCommand',
            delay: 0,
            retries: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default QueryCommand;
