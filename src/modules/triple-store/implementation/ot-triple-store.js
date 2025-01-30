import { QueryEngine as Engine } from '@comunica/query-sparql';
import { setTimeout } from 'timers/promises';
import {
    SCHEMA_CONTEXT,
    TRIPLE_STORE_CONNECT_MAX_RETRIES,
    TRIPLE_STORE_CONNECT_RETRY_FREQUENCY,
    MEDIA_TYPES,
    UAL_PREDICATE,
    BASE_NAMED_GRAPHS,
    TRIPLE_ANNOTATION_LABEL_PREDICATE,
    TRIPLES_VISIBILITY,
} from '../../../constants/constants.js';

class OtTripleStore {
    async initialize(config, logger) {
        this.logger = logger;
        this.repositories = config.repositories;
        this.initializeRepositories();
        this.initializeContexts();
        await this.ensureConnections();
        this.queryEngine = new Engine();
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
                httpTimeout: 60_000,
                httpBodyTimeout: true,
            };
            this.repositories[repository].queryContext = {
                sources,
                httpTimeout: 60_000,
                httpBodyTimeout: true,
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

    async insetAssertionInNamedGraph(repository, namedGraph, nquads) {
        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            INSERT DATA {
                GRAPH <${namedGraph}> { 
                    ${nquads.join('\n')}
                } 
            }
        `;

        await this.queryVoid(repository, query);
    }

    async deleteUniqueKnowledgeCollectionTriplesFromUnifiedGraph(repository, namedGraph, ual) {
        const query = `
            DELETE {
                GRAPH <${namedGraph}> {
                    ?s ?p ?o .
                    << ?s ?p ?o >> ?annotationPredicate ?annotationValue .
                }
            }
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} ?annotationValue .
                }
                FILTER(STRSTARTS(STR(?annotationValue), "${ual}/"))

                {
                    SELECT ?s ?p ?o (COUNT(?annotationValue) AS ?annotationCount)
                    WHERE {
                        GRAPH <${namedGraph}> {
                            << ?s ?p ?o >> ${UAL_PREDICATE} ?annotationValue .
                        }
                    }
                    GROUP BY ?s ?p ?o
                    HAVING(?annotationCount = 1)
                }
            }
        `;

        await this.queryVoid(repository, query);
    }

    async getKnowledgeCollectionFromUnifiedGraph(repository, namedGraph, ual, sort) {
        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            CONSTRUCT { ?s ?p ?o . }
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} ?ual .
                    FILTER(STRSTARTS(STR(?ual), "${ual}/"))
                }
            }
            ${sort ? 'ORDER BY ?s' : ''}
        `;

        return this.construct(repository, query);
    }

    async getKnowledgeCollectionPublicFromUnifiedGraph(repository, namedGraph, ual, sort) {
        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            CONSTRUCT { ?s ?p ?o }
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} ?ual .
                    FILTER(STRSTARTS(STR(?ual), "${ual}/"))
                    FILTER NOT EXISTS {
                        << ?s ?p ?o >> ${TRIPLE_ANNOTATION_LABEL_PREDICATE} "private" .
                    }
                }
            }
            ${sort ? 'ORDER BY ?s' : ''}
        `;

        return this.construct(repository, query);
    }

    async knowledgeCollectionExistsInUnifiedGraph(repository, namedGraph, ual) {
        const query = `
            ASK
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} ?ual
                    FILTER(STRSTARTS(STR(?ual), "${ual}/"))
                }
            }
        `;

        return this.ask(repository, query);
    }

    async deleteUniqueKnowledgeAssetTriplesFromUnifiedGraph(repository, namedGraph, ual) {
        const query = `
            DELETE {
                GRAPH <${namedGraph}> {
                    ?s ?p ?o .
                    << ?s ?p ?o >> ?annotationPredicate ?annotationValue .
                }
            }
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} <${ual}> .
                }

                {
                    SELECT ?s ?p ?o (COUNT(?annotationValue) AS ?annotationCount)
                    WHERE {
                        GRAPH <${namedGraph}> {
                            << ?s ?p ?o >> ${UAL_PREDICATE} ?annotationValue .
                        }
                    }
                    GROUP BY ?s ?p ?o
                    HAVING(?annotationCount = 1)
                }
            }
        `;

        await this.queryVoid(repository, query);
    }

    async getKnowledgeAssetFromUnifiedGraph(repository, namedGraph, ual) {
        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            CONSTRUCT { ?s ?p ?o . }
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} <${ual}> .
                }
            }
        `;

        return this.construct(repository, query);
    }

    async getKnowledgeAssetPublicFromUnifiedGraph(repository, namedGraph, ual) {
        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            CONSTRUCT { ?s ?p ?o }
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} <${ual}> .
                    FILTER NOT EXISTS {
                        << ?s ?p ?o >> ${TRIPLE_ANNOTATION_LABEL_PREDICATE} "private" .
                    }
                }
            }
        `;

        return this.construct(repository, query);
    }

    async knowledgeAssetExistsInUnifiedGraph(repository, namedGraph, ual) {
        const query = `
            ASK
            WHERE {
                GRAPH <${namedGraph}> {
                    << ?s ?p ?o >> ${UAL_PREDICATE} <${ual}>
                }
            }
        `;

        return this.ask(repository, query);
    }

    async createKnowledgeCollectionNamedGraphs(
        repository,
        uals,
        assetsNQuads,
        visibility,
        retries = 5,
        retryDelay = 10,
    ) {
        const queries = uals.map(
            (ual, index) => `
                PREFIX schema: <${SCHEMA_CONTEXT}>
                INSERT DATA {
                    GRAPH <${ual}/${visibility}> {
                        ${assetsNQuads[index].join('\n')}
                    }
                }
            `,
        );
        for (const [index, query] of queries.entries()) {
            let attempts = 0;
            let success = false;

            while (attempts < retries && !success) {
                try {
                    await this.queryVoid(repository, query);
                    success = true;
                } catch (error) {
                    attempts += 1;
                    if (attempts < retries) {
                        this.logger.warn(
                            `Insert failed for GRAPH <${uals[index]}/${visibility}>. Attempt ${attempts}/${retries}. Retrying in ${retryDelay}ms.`,
                        );
                        await setTimeout(retryDelay);
                    } else {
                        throw new Error(
                            `Failed to insert into GRAPH <${uals[index]}/${visibility}> after ${retries} attempts.`,
                        );
                    }
                }
            }
        }
    }

    async deleteKnowledgeCollectionNamedGraphs(repository, uals) {
        const query = `${uals.map((ual) => `DROP GRAPH <${ual}>`).join(';\n')};`;

        await this.queryVoid(repository, query);
    }

    async getKnowledgeCollectionNamedGraphs(repository, tokenIds, ual, visibility) {
        const namedGraphs = Array.from(
            { length: tokenIds.endTokenId - tokenIds.startTokenId + 1 },
            (_, i) => tokenIds.startTokenId + i,
        )
            .filter((id) => !tokenIds.burned.includes(id))
            .map((id) => `${ual}/${id}`);
        const assertion = {};
        if (visibility === TRIPLES_VISIBILITY.PUBLIC || visibility === TRIPLES_VISIBILITY.ALL) {
            const query = `
            PREFIX schema: <http://schema.org/>
            CONSTRUCT {
                ?s ?p ?o .
              }
              WHERE {
                GRAPH ?g {
                  ?s ?p ?o .
                }
                VALUES ?g {
                    ${namedGraphs
                        .map((graph) => `<${graph}/${TRIPLES_VISIBILITY.PUBLIC}>`)
                        .join('\n')}
                }
              }`;
            assertion.public = await this.construct(repository, query);
        }
        if (visibility === TRIPLES_VISIBILITY.PRIVATE || visibility === TRIPLES_VISIBILITY.ALL) {
            const query = `
            PREFIX schema: <http://schema.org/>
            CONSTRUCT {
                ?s ?p ?o .
              }
              WHERE {
                GRAPH ?g {
                  ?s ?p ?o .
                }
                VALUES ?g {
                    ${namedGraphs
                        .map((graph) => `<${graph}/${TRIPLES_VISIBILITY.PRIVATE}>`)
                        .join('\n')}
                }
              }`;
            assertion.private = await this.construct(repository, query);
        }

        return assertion;
    }

    async knowledgeCollectionNamedGraphsExist(repository, ual) {
        const query = `
        ASK {
            GRAPH <${ual}/1/public> {
                ?s ?p ?o
            }
        }
    `;

        return this.ask(repository, query);
    }

    async deleteKnowledgeAssetNamedGraph(repository, ual) {
        const query = `
            DROP GRAPH <${ual}>
        `;

        await this.queryVoid(repository, query);
    }

    async getKnowledgeAssetNamedGraph(repository, ual, visibility) {
        let whereClause;

        switch (visibility) {
            case TRIPLES_VISIBILITY.PUBLIC:
            case TRIPLES_VISIBILITY.PRIVATE:
                whereClause = `
                    WHERE {
                        GRAPH <${ual}/${visibility}> {
                            ?s ?p ?o .
                        }
                    }
                `;
                break;
            case TRIPLES_VISIBILITY.ALL:
                whereClause = `
                    WHERE {
                        {
                            GRAPH <${ual}/${TRIPLES_VISIBILITY.PUBLIC}> {
                              ?s ?p ?o .
                            }
                          }
                          UNION
                          {
                            GRAPH <${ual}/${TRIPLES_VISIBILITY.PRIVATE}> {
                              ?s ?p ?o .
                            }
                          }
                    }
                `;
                break;
            default:
                throw new Error(`Unsupported visibility: ${visibility}`);
        }

        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            CONSTRUCT { ?s ?p ?o }
            ${whereClause}
        `;

        return this.construct(repository, query);
    }

    async knowledgeAssetNamedGraphExists(repository, name) {
        const query = `
            ASK {
                GRAPH <${name}> {
                    ?s ?p ?o
                }
            }
        `;

        return this.ask(repository, query);
    }

    async insertKnowledgeCollectionMetadata(repository, metadataNQuads) {
        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            INSERT DATA {
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> { 
                    ${metadataNQuads} 
                } 
            }
        `;

        await this.queryVoid(repository, query);
    }

    async deleteKnowledgeCollectionMetadata(repository, ual) {
        const query = `
            DELETE
            WHERE {
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    ?ual ?p ?o .
                    FILTER(STRSTARTS(STR(?ual), "${ual}/"))
                }
            }
        `;

        await this.queryVoid(repository, query);
    }

    async getKnowledgeCollectionMetadata(repository, ual) {
        const query = `
            CONSTRUCT { ?ual ?p ?o . }
            WHERE {
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    ?ual ?p ?o .
                    FILTER(STRSTARTS(STR(?ual), "${ual}/"))
                }
            }
        `;

        return this.construct(repository, query);
    }

    async getKnowledgeAssetMetadata(repository, ual) {
        const query = `
            CONSTRUCT { <${ual}> ?p ?o . }
            WHERE {
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    <${ual}> ?p ?o .
                }
            }
        `;

        return this.construct(repository, query);
    }

    async knowledgeCollectionMetadataExists(repository, ual) {
        const query = `
            ASK {
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    ?ual ?p ?o
                    FILTER(STRSTARTS(STR(?ual), "${ual}/"))
                }
            }
        `;

        return this.ask(repository, query);
    }

    async findAllNamedGraphsByUAL(repository, ual) {
        const query = `
            SELECT DISTINCT ?g
            WHERE {
                GRAPH ?g {
                    ?s ?p ?o
                }
                FILTER(STRSTARTS(STR(?g), "${ual}"))
            }`;

        this.select(repository, query);
    }

    async findAllSubjectsWithGraphNames(repository, ual) {
        const query = `
            SELECT DISTINCT ?s ?g
            WHERE {
                GRAPH ?g {
                    ?s ?p ?o
                }
                FILTER(STRSTARTS(STR(?g), "${ual}"))
            }`;
        this.select(repository, query);
    }

    async getLatestAssertionId(repository, ual) {
        const query = `SELECT ?assertionId
        WHERE {
          GRAPH <assets:graph> {
            <${ual}> ?p ?assertionId
          }
        }`;

        const data = await this.select(repository, query);

        const fullAssertionId = data?.[0]?.assertionId;

        const latestAssertionId = fullAssertionId?.replace('assertion:', '');

        return latestAssertionId;
    }

    async construct(repository, query) {
        return this._executeQuery(repository, query, MEDIA_TYPES.N_QUADS);
    }

    async select(repository, query) {
        // todo: add media type once bug is fixed
        // no media type is passed because of comunica bug
        // https://github.com/comunica/comunica/issues/1034
        const result = await this._executeQuery(repository, query);
        return result ? JSON.parse(result) : [];
    }

    async queryVoid(repository, query) {
        return this.queryEngine.queryVoid(query, this.repositories[repository].updateContext);
    }

    async ask(repository, query) {
        return this.queryEngine.queryBoolean(query, this.repositories[repository].queryContext);
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

    // OLD REPOSITORIES SUPPORT

    cleanEscapeCharacter(query) {
        return query.replace(/['|[\]\\]/g, '\\$&');
    }

    async getV6Assertion(repository, assertionId) {
        if (!assertionId) return '';

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
}

export default OtTripleStore;
