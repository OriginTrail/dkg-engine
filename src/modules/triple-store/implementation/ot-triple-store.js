import { QueryEngine as Engine } from '@comunica/query-sparql';
import { trace } from '@opentelemetry/api';
import { setTimeout } from 'timers/promises';
import {
    SCHEMA_CONTEXT,
    TRIPLE_STORE_CONNECT_MAX_RETRIES,
    TRIPLE_STORE_CONNECT_RETRY_FREQUENCY,
    MEDIA_TYPES,
} from '../../../constants/constants.js';

class OtTripleStore {
    async initialize(config, logger) {
        this.logger = logger;
        this.repositories = config.repositories;
        this.initializeRepositories();
        this.initializeContexts();
        await this.ensureConnections();
        this.queryEngine = new Engine();
        this.tracer = trace.getTracer('triple-store');
    }

    initializeRepositories() {
        for (const repository of Object.keys(this.repositories)) {
            this.initializeSparqlEndpoints(repository);
        }
    }

    async initializeParanetRepository(repository) {
        const publicCurrent = 'publicCurrent';
        this.repositories[repository] = {
            url: this.repositories[publicCurrent].url,
            name: repository,
            username: this.repositories[publicCurrent].username,
            password: this.repositories[publicCurrent].password,
        };
        this.initializeSparqlEndpoints(repository);
        this.initializeContexts();
        await this.ensureConnections();
        await this.createRepository(repository);
    }

    async createRepository() {
        throw Error('CreateRepository not implemented');
    }

    initializeSparqlEndpoints() {
        throw Error('initializeSparqlEndpoints not implemented');
    }

    async deleteRepository() {
        throw Error('deleteRepository not implemented');
    }

    initializeContexts() {
        for (const repository in this.repositories) {
            const sources = [
                {
                    type: 'sparql',
                    value: this.repositories[repository].sparqlEndpoint,
                },
            ];

            this.repositories[repository].updateContext = {
                sources,
                destination: {
                    type: 'sparql',
                    value: this.repositories[repository].sparqlEndpointUpdate,
                },
            };
            this.repositories[repository].queryContext = {
                sources,
            };
        }
    }

    async ensureConnections() {
        const ensureConnectionPromises = Object.keys(this.repositories).map(async (repository) => {
            let ready = await this.healthCheck(repository);
            let retries = 0;
            while (!ready && retries < TRIPLE_STORE_CONNECT_MAX_RETRIES) {
                retries += 1;
                this.logger.warn(
                    `Cannot connect to Triple store (${this.getName()}), repository: ${repository}, located at: ${
                        this.repositories[repository].url
                    }  retry number: ${retries}/${TRIPLE_STORE_CONNECT_MAX_RETRIES}. Retrying in ${TRIPLE_STORE_CONNECT_RETRY_FREQUENCY} seconds.`,
                );
                /* eslint-disable no-await-in-loop */
                await setTimeout(TRIPLE_STORE_CONNECT_RETRY_FREQUENCY * 1000);
                ready = await this.healthCheck(repository);
            }
            if (retries === TRIPLE_STORE_CONNECT_MAX_RETRIES) {
                this.logger.error(
                    `Triple Store (${this.getName()})  not available, max retries reached.`,
                );
                process.exit(1);
            }
        });

        await Promise.all(ensureConnectionPromises);
    }

    async assetExists(repository, ual) {
        const query = `PREFIX schema: <${SCHEMA_CONTEXT}>
                        ASK WHERE {
                            GRAPH <assets:graph> {
                                <${ual}> ?p ?o
                            }
                        }`;

        return this.ask(repository, query);
    }

    async insertAssetAssertionLink(repository, ual, assertionId) {
        const assetExists = await this.assetExists(repository, ual);

        if (assetExists) {
            const insertQuery = `
                PREFIX schema: <${SCHEMA_CONTEXT}>
                INSERT DATA {
                    GRAPH <assets:graph> {
                        <${ual}> schema:assertion <assertion:${assertionId}> .
                    }
                }`;
            await this.queryVoid(repository, insertQuery);
        }
    }

    async deleteAssetAssertionLink(repository, ual, assertionId) {
        const linkExists = await this.assetAssertionLinkExists(repository, ual, assertionId);

        if (linkExists) {
            const deleteQuery = `
                PREFIX schema: <${SCHEMA_CONTEXT}>
                DELETE DATA {
                    GRAPH <assets:graph> {
                        <${ual}> schema:assertion <assertion:${assertionId}> .
                    }
                }`;
            await this.queryVoid(repository, deleteQuery);
        }
    }

    async updateAssetAssertionLink(repository, ual, oldAssertionId, newAssertionId) {
        const linkExists = await this.assetAssertionLinkExists(repository, ual, oldAssertionId);

        if (linkExists) {
            const updateQuery = `
                PREFIX schema: <${SCHEMA_CONTEXT}>
                DELETE {
                    GRAPH <assets:graph> {
                        <${ual}> schema:assertion <assertion:${oldAssertionId}> .
                    }
                } INSERT {
                    GRAPH <assets:graph> {
                        <${ual}> schema:assertion <assertion:${newAssertionId}> .
                    }
                } WHERE {
                    GRAPH <assets:graph> {
                        <${ual}> schema:assertion <assertion:${oldAssertionId}> .
                    }
                }`;
            await this.queryVoid(repository, updateQuery);
        }
    }

    async getAssetAssertionLinks(repository, ual) {
        const query = `PREFIX schema: <${SCHEMA_CONTEXT}>
                        SELECT ?assertion  WHERE {
                            GRAPH <assets:graph> {
                                    <${ual}> schema:assertion ?assertion
                            }
                        }`;

        return this.select(repository, query);
    }

    async assetAssertionLinkExists(repository, ual, assertionId) {
        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            ASK {
                GRAPH <assets:graph> {
                    <${ual}> schema:assertion <assertion:${assertionId}> .
                }
            }`;

        return this.ask(repository, query);
    }

    async updateAssetNonAssertionMetadata(repository, ual, assetNquads) {
        const updateQuery = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            DELETE {
                GRAPH <assets:graph> {
                    <${ual}> ?p ?o .
                    FILTER(?p != schema:assertion)
                }
            }
            INSERT {
                GRAPH <assets:graph> { 
                    ${assetNquads} 
                }
            }
            WHERE {
                GRAPH <assets:graph> {
                    <${ual}> ?p ?o .
                    FILTER(?p != schema:assertion)
                }
            }`;
        await this.queryVoid(repository, updateQuery);
    }

    async deleteAssetMetadata(repository, ual) {
        const query = `DELETE WHERE {
                GRAPH <assets:graph> {
                    <${ual}> ?p ?o
                }
            };`;

        return this.queryVoid(repository, query);
    }

    async countAssetsWithAssertionId(repository, assertionId) {
        const query = `PREFIX schema: <${SCHEMA_CONTEXT}>
                    SELECT (COUNT(DISTINCT ?ual) as ?count)
                    WHERE {
                        GRAPH <assets:graph> {
                                ?ual schema:assertion <assertion:${assertionId}>
                        }
                    }`;
        return this.select(repository, query);
    }

    async getAssetAssertionIds(repository, ual) {
        const query = `PREFIX schema: <${SCHEMA_CONTEXT}>
                    SELECT DISTINCT ?assertionId
                    WHERE {
                        GRAPH <assets:graph> {
                                <${ual}> schema:assertion ?assertionId .
                        }
                    }`;
        return this.select(repository, query);
    }

    async insertAssetAssertionMetadata(repository, ual, assetNquads, checkExists) {
        if (checkExists) {
            const existedBeforeInsertion = await this.assetExists(repository, ual);
            if (existedBeforeInsertion) {
                return;
            }
        }

        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            INSERT DATA {
                GRAPH <assets:graph> { 
                    ${assetNquads} 
                }
            }`;
        await this.queryVoid(repository, query);
    }

    async insertAssertion(repository, assertionId, assertionNquads, checkExists) {
        if (checkExists) {
            const existedBeforeInsertion = await this.assertionExists(repository, assertionId);
            if (existedBeforeInsertion) {
                return;
            }
        }

        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            INSERT DATA {
                GRAPH <assertion:${assertionId}> { 
                    ${assertionNquads} 
                } 
            }`;
        await this.queryVoid(repository, query);
    }

    _wrapPromiseInSpan(promise, name, attributes) {
        return this.tracer.startActiveSpan(name, { attributes }, async (span) =>
            promise
                .then((result) => {
                    span.end();
                    return result;
                })
                .catch((error) => {
                    span.recordException(error);
                    span.end();
                    throw error;
                }),
        );
    }

    async construct(repository, query) {
        return this._wrapPromiseInSpan(
            this._executeQuery(repository, query, MEDIA_TYPES.N_QUADS),
            'SPARQL - CONSTRUCT',
            {
                'sparql.repository': repository,
                'sparql.query': query,
            },
        );
    }

    async select(repository, query) {
        // todo: add media type once bug is fixed
        // no media type is passed because of comunica bug
        // https://github.com/comunica/comunica/issues/1034
        return this._wrapPromiseInSpan(this._executeQuery(repository, query), 'SPARQL - SELECT', {
            'sparql.repository': repository,
            'sparql.query': query,
        });
    }

    async queryVoid(repository, query) {
        return this._wrapPromiseInSpan(
            this.queryEngine.queryVoid(query, this.repositories[repository].updateContext),
            'SPARQL - QUERY',
            {
                'sparql.repository': repository,
                'sparql.query': query,
            },
        );
    }

    async ask(repository, query) {
        return this._wrapPromiseInSpan(
            this.queryEngine.queryBoolean(query, this.repositories[repository].queryContext),
            'SPARQL - ASK',
            {
                'sparql.repository': repository,
                'sparql.query': query,
            },
        );
    }

    async assertionExists(repository, assertionId) {
        const escapedAssertionId = this.cleanEscapeCharacter(assertionId);
        const query = `ASK WHERE { GRAPH <assertion:${escapedAssertionId}> { ?s ?p ?o } }`;

        return this.ask(repository, query);
    }

    async deleteAssertion(repository, assertionId) {
        const query = `DROP GRAPH <assertion:${assertionId}>`;

        await this.queryVoid(repository, query);
    }

    async getAssertion(repository, assertionId) {
        const escapedGraphName = this.cleanEscapeCharacter(assertionId);

        const query = `PREFIX schema: <${SCHEMA_CONTEXT}>
                    CONSTRUCT { ?s ?p ?o }
                    WHERE {
                        {
                            GRAPH <assertion:${escapedGraphName}>
                            {
                                ?s ?p ?o .
                            }
                        }
                    }`;
        return this.construct(repository, query);
    }

    async healthCheck() {
        return true;
    }

    async _executeQuery(repository, query, mediaType) {
        const result = await this.queryEngine.query(
            query,
            this.repositories[repository].queryContext,
        );
        const { data } = await this.queryEngine.resultToString(result, mediaType);

        let response = '';

        for await (const chunk of data) {
            response += chunk;
        }

        return response;
    }

    cleanEscapeCharacter(query) {
        return query.replace(/['|[\]\\]/g, '\\$&');
    }

    async reinitialize() {
        const ready = await this.healthCheck();
        if (!ready) {
            this.logger.warn(
                `Cannot connect to Triple store (${this.getName()}), check if your triple store is running.`,
            );
        } else {
            this.implementation.initialize(this.logger);
        }
    }
}

export default OtTripleStore;
