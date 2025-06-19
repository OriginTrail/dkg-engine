/* eslint-disable no-await-in-loop */
import { setTimeout } from 'timers/promises';
import { kcTools } from 'assertion-tools';
import {
    BASE_NAMED_GRAPHS,
    TRIPLE_STORE_REPOSITORY,
    TRIPLES_VISIBILITY,
    PRIVATE_HASH_SUBJECT_PREFIX,
    DKG_PREDICATE,
    HAS_KNOWLEDGE_ASSET_SUFFIX,
    HAS_NAMED_GRAPH_SUFFIX,
    DKG_METADATA_PREDICATES,
    SCHEMA_CONTEXT,
} from '../constants/constants.js';

class TripleStoreService {
    constructor(ctx) {
        this.config = ctx.config;
        this.logger = ctx.logger;

        this.tripleStoreModuleManager = ctx.tripleStoreModuleManager;
        this.operationIdService = ctx.operationIdService;
        this.ualService = ctx.ualService;
        this.dataService = ctx.dataService;
        this.paranetService = ctx.paranetService;
        this.cryptoService = ctx.cryptoService;
    }

    initializeRepositories() {
        this.repositoryImplementations = {};
        for (const implementationName of this.tripleStoreModuleManager.getImplementationNames()) {
            for (const repository in this.tripleStoreModuleManager.getImplementation(
                implementationName,
            ).module.repositories) {
                this.repositoryImplementations[repository] = implementationName;
            }
        }
    }

    async insertKnowledgeCollection(
        repository,
        knowledgeCollectionUAL,
        triples,
        metadata,
        retries = 5,
        retryDelay = 50,
        paranetUAL = '',
        contentType = '',
    ) {
        this.logger.info(
            `Inserting Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                `to the Triple Store's ${repository} repository.`,
        );

        const publicAssertion = triples.public ?? triples;

        const filteredPublic = [];
        const privateHashTriples = [];
        const tripleSet = new Set();

        let totalNumberOfTriplesInserted = triples?.public
            ? triples.public.length + (triples.private?.length ?? 0)
            : triples?.length ?? 0;

        publicAssertion.forEach((triple) => {
            if (triple.startsWith(`<${PRIVATE_HASH_SUBJECT_PREFIX}`)) {
                privateHashTriples.push(triple);
            } else {
                filteredPublic.push(triple);
            }
        });

        const publicKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
            filteredPublic,
            true,
        );
        publicKnowledgeAssetsTriplesGrouped.push(
            ...kcTools.groupNquadsBySubject(privateHashTriples, true),
        );

        const publicKnowledgeAssetsUALs = publicKnowledgeAssetsTriplesGrouped.map(
            (_, index) => `${knowledgeCollectionUAL}/${index + 1}`,
        );

        const allPossibleNamedGraphs = [];

        let privateGraphsInsert = '';
        let currentPrivateMetadataTriples = '';
        let connectionPrivateMetadataTriples = '';

        const publicGraphsInsert = publicKnowledgeAssetsUALs
            .map(
                (ual, index) => `
            GRAPH <${ual}/${TRIPLES_VISIBILITY.PUBLIC}> {
                ${publicKnowledgeAssetsTriplesGrouped[index].join('\n')}
            }
        `,
            )
            .join('\n');

        const currentPublicMetadataTriples = publicKnowledgeAssetsUALs
            .map(
                (ual) =>
                    `<current:graph> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${ual}/${TRIPLES_VISIBILITY.PUBLIC}> .`,
            )
            .join('\n');

        const connectionPublicMetadataTriples = publicKnowledgeAssetsUALs
            .map((ual) => {
                const graphWithVisibility = `${ual}/${TRIPLES_VISIBILITY.PUBLIC}`;
                return [
                    `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_KNOWLEDGE_ASSET_SUFFIX}> <${ual}> .`,
                    `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${graphWithVisibility}> .`,
                ].join('\n');
            })
            .join('\n');

        // current metadata triple relates to which named graph that represents Knowledge Asset hold the lates(current) data
        // so for each Knowledge Asset there will be one current metadata triple
        // in this case there are publicKnowledgeAssetsUALs.length number of named graphs created so for each there will be one current metadata triple
        totalNumberOfTriplesInserted += publicKnowledgeAssetsUALs.length;

        publicKnowledgeAssetsUALs.forEach((ual) => {
            const graphWithVisibility = `${ual}/public`;

            tripleSet.add(
                `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_KNOWLEDGE_ASSET_SUFFIX}> <${ual}> .`,
            );
            tripleSet.add(
                `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${graphWithVisibility}> .`,
            );
        });

        this.logger.info(
            `Adding metadata triples for public asets for Knowledge Collection: ${knowledgeCollectionUAL}`,
        );

        allPossibleNamedGraphs.push(...publicKnowledgeAssetsUALs.map((ual) => `${ual}/public`));

        if (triples.private?.length) {
            const privateKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
                triples.private,
                true,
            );

            const privateKnowledgeAssetsUALs = [];

            const publicSubjectMap = publicKnowledgeAssetsTriplesGrouped.reduce(
                (map, group, index) => {
                    const [publicSubject] = group[0].split(' ');
                    map.set(publicSubject, index);
                    return map;
                },
                new Map(),
            );

            for (const privateTriple of privateKnowledgeAssetsTriplesGrouped) {
                const [privateSubject] = privateTriple[0].split(' ');
                if (publicSubjectMap.has(privateSubject)) {
                    const ualIndex = publicSubjectMap.get(privateSubject);
                    privateKnowledgeAssetsUALs.push(publicKnowledgeAssetsUALs[ualIndex]);
                } else {
                    const privateSubjectHashed = `<${PRIVATE_HASH_SUBJECT_PREFIX}${this.cryptoService.sha256(
                        privateSubject.slice(1, -1),
                    )}>`;
                    if (publicSubjectMap.has(privateSubjectHashed)) {
                        const ualIndex = publicSubjectMap.get(privateSubjectHashed);
                        privateKnowledgeAssetsUALs.push(publicKnowledgeAssetsUALs[ualIndex]);
                    }
                }
            }

            privateGraphsInsert = privateKnowledgeAssetsUALs
                .map(
                    (ual, index) => `
            GRAPH <${ual}/${TRIPLES_VISIBILITY.PRIVATE}> {
                ${privateKnowledgeAssetsTriplesGrouped[index].join('\n')}
            }
        `,
                )
                .join('\n');

            currentPrivateMetadataTriples = privateKnowledgeAssetsUALs
                .map(
                    (ual) =>
                        `<current:graph> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${ual}/${TRIPLES_VISIBILITY.PRIVATE}> .`,
                )
                .join('\n');

            connectionPrivateMetadataTriples = privateKnowledgeAssetsUALs
                .map((ual) => {
                    const graphWithVisibility = `${ual}/${TRIPLES_VISIBILITY.PRIVATE}`;
                    return [
                        `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_KNOWLEDGE_ASSET_SUFFIX}> <${ual}> .`,
                        `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${graphWithVisibility}> .`,
                    ].join('\n');
                })
                .join('\n');

            // current metadata triple relates to which named graph that represents Knowledge Asset hold the lates(current) data
            // so for each Knowledge Asset there will be one current metadata triple
            // in this case there are privateKnowledgeAssetsUALs.length number of named graphs created so for each there will be one current metadata triple
            totalNumberOfTriplesInserted += privateKnowledgeAssetsUALs.length;

            privateKnowledgeAssetsUALs.forEach((ual) => {
                const graphWithVisibility = `${ual}/private`;

                tripleSet.add(
                    `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_KNOWLEDGE_ASSET_SUFFIX}> <${ual}> .`,
                );
                tripleSet.add(
                    `<${knowledgeCollectionUAL}> <${DKG_PREDICATE}${HAS_NAMED_GRAPH_SUFFIX}> <${graphWithVisibility}> .`,
                );
            });

            this.logger.info(
                `Adding metadata triples for private asets for Knowledge Collection: ${knowledgeCollectionUAL}`,
            );

            allPossibleNamedGraphs.push(
                ...privateKnowledgeAssetsUALs.map((ual) => `${ual}/private`),
            );
        }

        // TODO: add new metadata triples and move to function insertMetadataTriples
        let metadataTriples = publicKnowledgeAssetsUALs
            .map(
                (publicKnowledgeAssetUAL) =>
                    `<${publicKnowledgeAssetUAL}> <http://schema.org/states> "${publicKnowledgeAssetUAL}:0" .`,
            )
            .join('\n');

        metadataTriples +=
            `\n<${knowledgeCollectionUAL}> <${DKG_METADATA_PREDICATES.PUBLISHED_BY}> <did:dkg:publisherKey/${metadata.publisherKey}> .` +
            `\n<${knowledgeCollectionUAL}> <${DKG_METADATA_PREDICATES.PUBLISHED_AT_BLOCK}> "${metadata.blockNumber}" .` +
            `\n<${knowledgeCollectionUAL}> <${DKG_METADATA_PREDICATES.PUBLISH_TX}> "${metadata.txHash}" .` +
            `\n<${knowledgeCollectionUAL}> <${
                DKG_METADATA_PREDICATES.PUBLISH_TIME
            }> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .` +
            `\n<${knowledgeCollectionUAL}> <${DKG_METADATA_PREDICATES.BLOCK_TIME}> "${new Date(
                metadata.blockTimestamp * 1000,
            ).toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`;

        // totalNumberOfTriplesInserted += publicKnowledgeAssetsUALs.length + 5; // one metadata triple for each public KA
        const insertQuery = `
            PREFIX schema: <${SCHEMA_CONTEXT}>
            INSERT DATA {
                ${publicGraphsInsert}
                ${privateGraphsInsert}
                GRAPH <${BASE_NAMED_GRAPHS.CURRENT}> {
                    ${currentPublicMetadataTriples}
                    ${currentPrivateMetadataTriples}
                }
                GRAPH <${BASE_NAMED_GRAPHS.METADATA}> {
                    ${connectionPublicMetadataTriples}
                    ${connectionPrivateMetadataTriples}
                    ${metadataTriples}
                }

            }
        `;

        const uniqueTripleCount = tripleSet.size;
        totalNumberOfTriplesInserted += uniqueTripleCount;

        let attempts = 0;
        let success = false;

        while (attempts < retries && !success) {
            try {
                await this.tripleStoreModuleManager.queryVoid(
                    this.repositoryImplementations[repository],
                    repository,
                    insertQuery,
                    this.config.modules.tripleStore.timeout.insert,
                );
                if (paranetUAL) {
                    await this.tripleStoreModuleManager.createParanetKnoledgeCollectionConnection(
                        this.repositoryImplementations[repository],
                        repository,
                        knowledgeCollectionUAL,
                        paranetUAL,
                        contentType,
                        this.config.modules.tripleStore.timeout.insert,
                    );
                    totalNumberOfTriplesInserted += allPossibleNamedGraphs.length; // one triple will be created for each Knowledge Asset inserted into paranet
                    this.logger.info(`Adding connection triples for paranet: ${paranetUAL}`);
                }
                success = true;

                this.logger.info(
                    `Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                        `has been successfully inserted to the Triple Store's ${repository} repository.`,
                );
            } catch (error) {
                this.logger.error(
                    `Error during insertion of the Knowledge Collection to the Triple Store's ${repository} repository. ` +
                        `UAL: ${knowledgeCollectionUAL}. Error: ${error.message}`,
                );
                attempts += 1;

                if (attempts < retries) {
                    this.logger.info(
                        `Retrying insertion of the Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                            `to the Triple Store's ${repository} repository. Attempt ${
                                attempts + 1
                            } of ${retries} after delay of ${retryDelay} ms.`,
                    );
                    await setTimeout(retryDelay);
                } else {
                    this.logger.error(
                        `Max retries reached for the insertion of the Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                            `to the Triple Store's ${repository} repository. Rolling back data.`,
                    );

                    this.logger.info(
                        `Rolling back Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                            `from the Triple Store's ${repository} repository Named Graphs.`,
                    );

                    await Promise.all([
                        this.tripleStoreModuleManager.deleteKnowledgeCollectionNamedGraphs(
                            this.repositoryImplementations[repository],
                            repository,
                            allPossibleNamedGraphs,
                        ),
                        this.tripleStoreModuleManager.deleteKnowledgeCollectionMetadata(
                            this.repositoryImplementations[repository],
                            repository,
                            allPossibleNamedGraphs,
                        ),
                    ]);

                    throw new Error(
                        `Failed to store Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                            `to the Triple Store's ${repository} repository after maximum retries. Error ${error}`,
                    );
                }
            }
        }

        return totalNumberOfTriplesInserted;
    }

    async insertKnowledgeCollectionBatch(repository, KCs) {
        // this.logger.info(
        //     `Inserting Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
        //         `to the Triple Store's ${repository} repository.`,
        // );
        // This metadata is not validated
        const { remote, metadata } = KCs;
        const insert = {};
        const createdMetadata = [];
        const currentNamedGraphTriples = [];
        // remote { ual: { public: [triples], private: [triples] } }
        for (const ual of Object.keys(remote)) {
            const triples = remote[ual].public;
            const filteredPublic = [];
            const privateHashTriples = [];

            triples.forEach((triple) => {
                if (triple.startsWith(`<${PRIVATE_HASH_SUBJECT_PREFIX}`)) {
                    privateHashTriples.push(triple);
                } else {
                    filteredPublic.push(triple);
                }
            });

            const publicKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
                filteredPublic,
                true,
            );
            publicKnowledgeAssetsTriplesGrouped.push(
                ...kcTools.groupNquadsBySubject(privateHashTriples, true),
            );

            const publicKnowledgeAssetsUALs = publicKnowledgeAssetsTriplesGrouped.map(
                (_, index) => `${ual}/${index + 1}`,
            );

            for (const [index, kaUAL] of publicKnowledgeAssetsUALs.entries()) {
                insert[`${kaUAL}/public`] = publicKnowledgeAssetsTriplesGrouped[index];
                createdMetadata.push(`<${kaUAL}> <http://schema.org/states> "${kaUAL}:0" .`);
                currentNamedGraphTriples.push(
                    `<current:graph> <https://ontology.origintrail.io/dkg/1.0#hasNamedGraph> <${kaUAL}/public> .`,
                );
                createdMetadata.push(
                    `<${ual}> <https://ontology.origintrail.io/dkg/1.0#hasKnowledgeAsset> <${kaUAL}> .`,
                );
            }
        }

        await this.tripleStoreModuleManager.insertAssertionBatch(
            TRIPLE_STORE_REPOSITORY.DKG,
            repository,
            insert,
            metadata,
            createdMetadata,
            currentNamedGraphTriples,
            this.config.modules.tripleStore.timeout.insert,
        );
    }

    async deletePublishTimestampMetadata(repository, ual) {
        await this.tripleStoreModuleManager.deletePublishTimestampMetadata(
            this.repositoryImplementations[repository],
            repository,
            ual,
        );
    }

    async checkIfKnowledgeCollectionExistsInUnifiedGraph(
        ual,
        repository = TRIPLE_STORE_REPOSITORY.DKG,
    ) {
        const knowledgeCollectionExists =
            await this.tripleStoreModuleManager.knowledgeCollectionExistsInUnifiedGraph(
                this.repositoryImplementations[repository],
                repository,
                BASE_NAMED_GRAPHS.UNIFIED,
                ual,
            );

        return knowledgeCollectionExists;
    }

    async getAssertion(
        blockchain,
        contract,
        knowledgeCollectionId,
        knowledgeAssetId,
        tokenIds,
        migrationFlag,
        visibility = TRIPLES_VISIBILITY.PUBLIC,
        repository = TRIPLE_STORE_REPOSITORY.DKG,
    ) {
        // TODO: Use stateId
        let ual = `did:dkg:${blockchain}/${contract}/${knowledgeCollectionId}`;

        let nquads;
        if (typeof knowledgeAssetId === 'string') {
            ual = `${ual}/${knowledgeAssetId}`;
            this.logger.debug(`Getting Assertion with the UAL: ${ual}.`);
            nquads = await this.tripleStoreModuleManager.getKnowledgeAssetNamedGraph(
                this.repositoryImplementations[repository],
                repository,
                // TODO: Add state with implemented update
                `${ual}`,
                knowledgeAssetId,
                visibility,
                this.config.modules.tripleStore.timeout.get,
            );
        } else {
            this.logger.debug(`Getting Assertion with the UAL: ${ual}.`);

            if (migrationFlag === '1') {
                nquads = await this.tripleStoreModuleManager.getKnowledgeCollectionNamedGraphs(
                    this.repositoryImplementations[repository],
                    repository,
                    ual,
                    knowledgeAssetId,
                    visibility,
                    this.config.modules.tripleStore.timeout.get,
                );
            } else {
                nquads = await this.tripleStoreModuleManager.getKnowledgeCollectionNamedGraphsOld(
                    this.repositoryImplementations[repository],
                    repository,
                    ual,
                    tokenIds,
                    visibility,
                    this.config.modules.tripleStore.timeout.get,
                );
            }
        }
        if (nquads?.public) {
            nquads.public = nquads.public.split('\n').filter((line) => line !== '');
        }
        if (nquads?.private) {
            nquads.private = nquads.private.split('\n').filter((line) => line !== '');
        }

        const numberOfnquads = (nquads?.public?.length ?? 0) + (nquads?.private?.length ?? 0);

        this.logger.debug(
            `Assertion: ${ual} ${
                numberOfnquads ? '' : 'is not'
            } found in the Triple Store's ${repository} repository.`,
        );

        if (nquads.length) {
            this.logger.debug(
                `Number of n-quads retrieved from the Triple Store's ${repository} repository: ${numberOfnquads}.`,
            );
        }

        return nquads;
    }

    async getAssertionsInBatch(repository, uals, ualTokenIds, visibility = 'public') {
        const results = await Promise.all(
            uals.map(async (ual) => {
                const nquads =
                    await this.tripleStoreModuleManager.getKnowledgeCollectionNamedGraphsOld(
                        this.repositoryImplementations[repository],
                        repository,
                        // TODO: Add state with implemented update
                        `${ual}`,
                        ualTokenIds[ual],
                        visibility,
                        this.config.modules.tripleStore.timeout.batchGet,
                    );
                if (nquads?.public) {
                    nquads.public = nquads.public.split('\n').filter((line) => line !== '');
                }
                if (nquads?.private) {
                    nquads.private = nquads.private.split('\n').filter((line) => line !== '');
                }

                return nquads;
            }),
        );
        const result = {};
        for (const [index, ual] of uals.entries()) {
            result[ual] = results[index];
        }

        return result;
    }

    async getV6Assertion(repository, assertionId) {
        this.logger.debug(
            `Getting Assertion with the ID: ${assertionId} from the Triple Store's ${repository} repository.`,
        );
        const nquads = await this.tripleStoreModuleManager.getV6Assertion(
            this.repositoryImplementations[repository],
            repository,
            assertionId,
        );

        this.logger.debug(
            `Assertion: ${assertionId} ${
                nquads.length ? '' : 'is not'
            } found in the Triple Store's ${repository} repository.`,
        );

        if (nquads.length) {
            this.logger.debug(
                `Number of n-quads retrieved from the Triple Store's ${repository} repository: ${nquads.length}.`,
            );
        }

        return nquads;
    }

    async getAssertionMetadata(
        blockchain,
        contract,
        knowledgeCollectionId,
        knowledgeAssetId,
        repository = TRIPLE_STORE_REPOSITORY.DKG,
    ) {
        const ual = `did:dkg:${blockchain}/${contract}/${knowledgeCollectionId}${
            Number.isInteger(knowledgeAssetId) ? `/${knowledgeAssetId}` : ''
        }`;
        this.logger.debug(`Getting Assertion Metadata with the UAL: ${ual}.`);
        let nquads;
        if (Number.isInteger(knowledgeAssetId)) {
            nquads = await this.tripleStoreModuleManager.getKnowledgeAssetMetadata(
                this.repositoryImplementations[repository],
                repository,
                ual,
                this.config.modules.tripleStore.timeout.get,
            );
        } else {
            nquads = await this.tripleStoreModuleManager.getKnowledgeCollectionMetadata(
                this.repositoryImplementations[repository],
                repository,
                ual,
                this.config.modules.tripleStore.timeout.get,
            );
        }
        nquads = nquads.split('\n').filter((line) => line !== '');

        this.logger.debug(
            `Knowledge Asset Metadata: ${ual} ${
                nquads.length ? '' : 'is not'
            } found in the Triple Store's ${repository} repository.`,
        );

        if (nquads.length) {
            this.logger.debug(
                `Number of n-quads retrieved from the Triple Store's ${repository} repository: ${nquads.length}.`,
            );
        }

        return nquads;
    }

    async getAssertionMetadataBatch(uals) {
        const metadataTriples = await this.tripleStoreModuleManager.getMetadataInBatch(
            this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            TRIPLE_STORE_REPOSITORY.DKG,
            uals,
        );

        const metadata = {};
        for (const line of metadataTriples.split('\n').filter((result) => result !== '')) {
            const splitLine = line.split(' ');
            const ual = splitLine[0].replace(/[<>]/g, '');
            if (!metadata[ual]) {
                metadata[ual] = [line];
            } else {
                metadata[ual].push(line);
            }
        }

        return metadata;
    }

    async getLatestAssertionId(repository, ual) {
        const nquads = await this.tripleStoreModuleManager.getLatestAssertionId(
            this.repositoryImplementations[repository],
            repository,
            ual,
        );

        return nquads;
    }

    async construct(query, repository = TRIPLE_STORE_REPOSITORY.DKG, timeout = 60000) {
        return this.tripleStoreModuleManager.construct(
            this.repositoryImplementations[repository] ??
                this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            repository,
            query,
            timeout,
        );
    }

    async getKnowledgeAssetNamedGraph(repository, ual, visibility, timeout) {
        return this.tripleStoreModuleManager.getKnowledgeAssetNamedGraph(
            this.repositoryImplementations[repository],
            repository,
            ual,
            visibility,
            timeout,
        );
    }

    async select(query, repository = TRIPLE_STORE_REPOSITORY.DKG, timeout = 60000) {
        return this.tripleStoreModuleManager.select(
            this.repositoryImplementations[repository] ??
                this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            repository,
            query,
            timeout,
        );
    }

    async ask(query, repository = TRIPLE_STORE_REPOSITORY.DKG) {
        return this.tripleStoreModuleManager.ask(
            this.repositoryImplementations[repository] ??
                this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            repository,
            query,
        );
    }

    getRepositorySparqlEndpoint(repository) {
        const implementationName = this.repositoryImplementations[repository];
        const endpoint =
            this.tripleStoreModuleManager.getImplementation(implementationName).module.repositories[
                repository
            ].sparqlEndpoint;
        return endpoint;
    }
}

export default TripleStoreService;
