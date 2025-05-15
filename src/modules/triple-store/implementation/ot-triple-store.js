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
    DKG_PREDICATE,
    HAS_KNOWLEDGE_ASSET_SUFFIX,
    HAS_NAMED_GRAPH_SUFFIX,
    DKG_METADATA_PREDICATES,
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

    repositoryInitilized(repository) {
        return Boolean(this.repositories && this.repositories[repository]);
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
        const graphInserts = uals
            .map(
                (ual, index) => `
                GRAPH <${ual}/${visibility}> {
                    ${assetsNQuads[index].join('\n')}
                }
            `,
            )
            .join('\n');

        const query = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            INSERT DATA {
                ${graphInserts}
            }
        `;

        let attempts = 0;
        let success = false;

        while (attempts < retries && !success) {
            try {
                await this.queryVoid(repository, query);
                success = true;
            } catch (error) {
                attempts += 1;
                if (attempts <= retries) {
                    this.logger.warn(
                        `Batch insert failed for ${uals[0]
                            .split('/')
                            .slice(0, -1)
                            .join(
                                '/',
                            )} graphs. Attempt ${attempts}/${retries}. Retrying in ${retryDelay}ms.`,
                    );
                    await setTimeout(retryDelay);
                } else {
                    throw new Error(
                        `Failed to perform batch insert after ${retries} attempts. Error: ${error.message}`,
                    );
                }
            }
        }
    }

    async createParanetKnoledgeCollectionConnection(repository, kcUAL, paranetUAL, contentType) {
        const getNamedGraphsQuery = `
            PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>
            SELECT ?g WHERE {
                GRAPH <metadata:graph> {
                    <${kcUAL}> dkg:hasNamedGraph ?g .
                }
            }
        `;

        let metadataConnections = await this.select(repository, getNamedGraphsQuery);

        if (contentType === 'public') {
            metadataConnections = metadataConnections.filter((row) => !row.g.includes('/private'));
        }

        const paranetConnectionTriples = metadataConnections
            .map(
                (row) =>
                    ` <${paranetUAL}> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${row.g}> .`,
            )
            .join('\n');

        const query = `
        INSERT DATA {
            GRAPH <${paranetUAL}> {
                   ${paranetConnectionTriples}
            }
        }
        `;

        await this.queryVoid(repository, query);
    }

    async insertMetadataTriples(repository, kcUAL, kaUALs, visibility) {
        const currentTriples = kaUALs
            .map(
                (ual) =>
                    `<current:graph> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${ual}/${visibility}> .`,
            )
            .join('\n');

        const connectionTriples = kaUALs
            .map((ual) => {
                const graphWithVisibility = `${ual}/${visibility}`;
                return [
                    `<${kcUAL}> <${DKG_PREDICATE}${HAS_KNOWLEDGE_ASSET_SUFFIX}> <${ual}> .`,
                    `<${kcUAL}> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${graphWithVisibility}> .`,
                ].join('\n');
            })
            .join('\n');

        const query = `
            INSERT DATA {
                GRAPH <${BASE_NAMED_GRAPHS.CURRENT}> {
                    ${currentTriples}
                }

                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    ${connectionTriples}
                }
            }
        `;

        await this.queryVoid(repository, query);
    }

    async deleteKnowledgeCollectionNamedGraphs(repository, namedGraphs) {
        if (!namedGraphs || namedGraphs.length === 0) return;

        const query = `${namedGraphs.map((graph) => `DROP GRAPH <${graph}>`).join(';\n')};`;

        await this.queryVoid(repository, query);
    }

    async getKnowledgeCollectionNamedGraphsOld(repository, ual, tokenIds, visibility) {
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

    // TODO: Clean up unused arguments of this method
    async getKnowledgeCollectionNamedGraphsOldInBatch(repository, uals, ualTokenIds, visibility) {
        // TODO: Validate this query
        const kaUALs = Array.from(Object.entries(ualTokenIds)).flatMap(([ual, tokenIds]) => {
            const arr = Array.from(
                { length: tokenIds.endTokenId - tokenIds.startTokenId + 1 },
                (_, i) => tokenIds.startTokenId + i,
            );
            if (
                visibility === TRIPLES_VISIBILITY.PUBLIC ||
                visibility === TRIPLES_VISIBILITY.PRIVATE
            ) {
                return arr
                    .filter((id) => !tokenIds.burned.includes(id))
                    .map((id) => `<${ual}/${id}/${visibility}>`);
            }
            // visibility === TRIPLES_VISIBILITY.ALL;
            // It should add both public and private suffixes
            return arr
                .filter((id) => !tokenIds.burned.includes(id))
                .flatMap((id) => [
                    `<${ual}/${id}/${TRIPLES_VISIBILITY.PUBLIC}>`,
                    `<${ual}/${id}/${TRIPLES_VISIBILITY.PRIVATE}>`,
                ]);
        });

        const query = `
            SELECT ?g ?s ?p ?o
            WHERE {
                VALUES ?g {
                    ${kaUALs.join('\n')}
                }
                GRAPH ?g {
                    ?s ?p ?o
                }
            }
        `;

        return this.selectTSV(repository, query);
    }

    async getKnowledgeCollectionNamedGraphs(repository, ual, knowledgeAssetId, visibility) {
        const assertion = {};
        let publicPrivateMetadataConnections = null;

        const getNamedGraphsQuery = `
            PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>
            SELECT ?g WHERE {
                GRAPH <metadata:graph> {
                    <${ual}> dkg:hasNamedGraph ?g .
                }
            }
        `;

        const getConstructQuery = (graphList) => `
            PREFIX schema: <http://schema.org/>
            CONSTRUCT {
                ?s ?p ?o .
            }
            WHERE {
                GRAPH ?g {
                    ?s ?p ?o .
                }
                VALUES ?g {
                    ${graphList.map((g) => `<${g}>`).join('\n')}
                }
            }
        `;

        const buildSingleGraph = async (visibilityType) => {
            const graph = `${ual}/${knowledgeAssetId}/${visibilityType}`;
            return getConstructQuery([graph]);
        };

        const buildAllGraphs = async (filter) => {
            if (!publicPrivateMetadataConnections) {
                publicPrivateMetadataConnections = await this.select(
                    repository,
                    getNamedGraphsQuery,
                );
            }
            return publicPrivateMetadataConnections
                .map((row) => row.g)
                .filter((graph) => graph.includes(filter));
        };

        if (visibility === TRIPLES_VISIBILITY.PUBLIC || visibility === TRIPLES_VISIBILITY.ALL) {
            if (knowledgeAssetId) {
                const singleGraph = await buildSingleGraph(TRIPLES_VISIBILITY.PUBLIC);
                assertion.public = await this.construct(repository, singleGraph);
            } else {
                const publicGraphs = await buildAllGraphs('/public');
                assertion.public = publicGraphs.length
                    ? await this.construct(repository, getConstructQuery(publicGraphs))
                    : '';
            }
        }

        if (visibility === TRIPLES_VISIBILITY.PRIVATE || visibility === TRIPLES_VISIBILITY.ALL) {
            if (knowledgeAssetId) {
                const singleGraph = await buildSingleGraph(TRIPLES_VISIBILITY.PRIVATE);
                assertion.private = await this.construct(repository, singleGraph);
            } else {
                const privateGraphs = await buildAllGraphs('/private');
                assertion.private = privateGraphs.length
                    ? await this.construct(repository, getConstructQuery(privateGraphs))
                    : '';
            }
        }

        return assertion;
    }

    async getKnowledgeCollectionNamedGraphsInBatch(repository, uals) {
        const query = `
            PREFIX dkg: <https://ontology.origintrail.io/dkg/1.0#>
            SELECT ?g ?s ?p ?o
            WHERE {
                GRAPH <metadata:graph> {
                    VALUES ?ual {
                        ${uals.map((ual) => `<${ual}>`).join('\n')}
                    }
                    ?ual dkg:hasNamedGraph ?g .
                }

                GRAPH ?g {
                    ?s ?p ?o
                }
            }
        `;

        return this.selectTSV(repository, query);
    }

    async getMetadataInBatch(repository, uals) {
        const query = `
            CONSTRUCT {
                ?ual ?p ?o
            }
            WHERE {
                VALUES ?ual {
                    ${uals.map((ual) => `<${ual}>`).join('\n')}
                }
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    ?ual ?p ?o
                }
            }
        `;

        return this.construct(repository, query);
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

    async deleteKnowledgeCollectionMetadata(repository, uals) {
        const cleanedUals = [...new Set(uals.map((ual) => ual.replace(/\/(public|private)$/, '')))];
        const kcUAL = cleanedUals[0].split('/').slice(0, -1).join('/');

        let query = `${cleanedUals
            .map(
                (ual) =>
                    `DELETE WHERE { GRAPH <${BASE_NAMED_GRAPHS.METADATA}> { <${ual}> ?p ?o . } }`,
            )
            .join(';\n')};`;

        query += `DELETE WHERE { GRAPH <${BASE_NAMED_GRAPHS.METADATA}> <${kcUAL}> ?p ?o . }`;

        await this.queryVoid(repository, query);
    }

    async deletePublishTimestampMetadata(repository, ual) {
        const query = `
            DELETE WHERE {
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    <${ual}> <${DKG_METADATA_PREDICATES.PUBLISH_TIME}> ?o .
                }
            }
        `;

        await this.queryVoid(repository, query);
    }

    async getKnowledgeCollectionMetadata(repository, ual) {
        const query = `
        CONSTRUCT {
            <${ual}> ?p ?o .
        }
        WHERE {
            GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                <${ual}> ?p ?o .
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

    async selectTSV(repository, query) {
        const result = await this.queryEngine.query(
            query,
            this.repositories[repository].queryContext,
        );

        const { data } = await this.queryEngine.resultToString(result, 'text/tab-separated-values');

        let response = '';

        for await (const chunk of data) {
            response += chunk;
        }
        // Remove top line of TSV
        return response.indexOf('\n') > -1 ? response.slice(response.indexOf('\n') + 1) : response;
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
