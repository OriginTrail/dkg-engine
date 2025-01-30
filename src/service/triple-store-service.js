/* eslint-disable no-await-in-loop */
import { setTimeout } from 'timers/promises';
import { kcTools } from 'assertion-tools';

import {
    BASE_NAMED_GRAPHS,
    TRIPLE_STORE_REPOSITORY,
    TRIPLES_VISIBILITY,
    PRIVATE_HASH_SUBJECT_PREFIX,
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
        retries = 5,
        retryDelay = 50,
    ) {
        this.logger.info(
            `Inserting Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                `to the Triple Store's ${repository} repository.`,
        );

        const existsInNamedGraphs =
            await this.tripleStoreModuleManager.knowledgeCollectionNamedGraphsExist(
                this.repositoryImplementations[repository],
                repository,
                knowledgeCollectionUAL,
            );

        // TODO: Add with the introduction of RDF-star mode
        // const tripleAnnotations = this.dataService.createTripleAnnotations(
        //     knowledgeAssetsTriples,
        //     UAL_PREDICATE,
        //     knowledgeAssetsUALs.map((ual) => `<${ual}>`),
        // );
        // const unifiedGraphTriples = [...triples, ...tripleAnnotations];
        const promises = [];
        const publicAssertion = triples.public ?? triples;

        const filteredPublic = [];
        const privateHashTriples = [];
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

        if (!existsInNamedGraphs) {
            promises.push(
                this.tripleStoreModuleManager.createKnowledgeCollectionNamedGraphs(
                    this.repositoryImplementations[repository],
                    repository,
                    publicKnowledgeAssetsUALs,
                    publicKnowledgeAssetsTriplesGrouped,
                    TRIPLES_VISIBILITY.PUBLIC,
                ),
            );

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
                promises.push(
                    this.tripleStoreModuleManager.createKnowledgeCollectionNamedGraphs(
                        this.repositoryImplementations[repository],
                        repository,
                        privateKnowledgeAssetsUALs,
                        privateKnowledgeAssetsTriplesGrouped,
                        TRIPLES_VISIBILITY.PRIVATE,
                    ),
                );
            }
        }
        const metadataTriples = publicKnowledgeAssetsUALs
            .map(
                (publicKnowledgeAssetUAL) =>
                    `<${publicKnowledgeAssetUAL}> <http://schema.org/states> "${publicKnowledgeAssetUAL}:0" .`,
            )
            .join('\n');

        promises.push(
            this.tripleStoreModuleManager.insertKnowledgeCollectionMetadata(
                this.repositoryImplementations[repository],
                repository,
                metadataTriples,
            ),
        );

        let attempts = 0;
        let success = false;

        while (attempts < retries && !success) {
            try {
                await Promise.all(promises);

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

                    if (!existsInNamedGraphs) {
                        this.logger.info(
                            `Rolling back Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                                `from the Triple Store's ${repository} repository Named Graphs.`,
                        );
                        await this.tripleStoreModuleManager.deleteKnowledgeCollectionNamedGraphs(
                            this.repositoryImplementations[repository],
                            repository,
                            publicKnowledgeAssetsUALs,
                        );
                    }

                    throw new Error(
                        `Failed to store Knowledge Collection with the UAL: ${knowledgeCollectionUAL} ` +
                            `to the Triple Store's ${repository} repository after maximum retries. Error ${error}`,
                    );
                }
            }
        }
    }

    async createV6KnowledgeCollection(triplesPublic, ual, triplesPrivate = null) {
        this.logger.info(
            `Inserting Knowledge Collection with the UAL: ${ual} ` +
                `to the Triple Store's ${TRIPLE_STORE_REPOSITORY.DKG} repository.`,
        );
        const publicKnowledgeAssetsTriplesGrouped = [triplesPublic];
        const publicKnowledgeAssetsUALs = [`${ual}/1`];
        await this.tripleStoreModuleManager.createKnowledgeCollectionNamedGraphs(
            this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            TRIPLE_STORE_REPOSITORY.DKG,
            publicKnowledgeAssetsUALs,
            publicKnowledgeAssetsTriplesGrouped,
            TRIPLES_VISIBILITY.PUBLIC,
        );

        if (triplesPrivate) {
            const privateKnowledgeAssetsTriplesGrouped = [triplesPrivate];
            await this.tripleStoreModuleManager.createKnowledgeCollectionNamedGraphs(
                this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
                TRIPLE_STORE_REPOSITORY.DKG,
                publicKnowledgeAssetsUALs,
                privateKnowledgeAssetsTriplesGrouped,
                TRIPLES_VISIBILITY.PRIVATE,
            );
        }

        const metadataTriples = [`<${ual}> <http://schema.org/states> "${ual}:0" .`];
        await this.tripleStoreModuleManager.insertKnowledgeCollectionMetadata(
            this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            TRIPLE_STORE_REPOSITORY.DKG,
            metadataTriples,
        );
    }

    async insertUpdatedKnowledgeCollection(preUpdateUalNamedGraphs, ual, triples, firstNewKAIndex) {
        const preUpdateSubjectUalMap = new Map(
            preUpdateUalNamedGraphs.map((entry) => [
                entry.subject,
                entry.g.split('/').slice(0, -1).join('/'),
            ]),
        );

        const publicKnowledgeAssetsTriples = this.dataService.groupTriplesBySubject(
            triples.public ?? triples,
        );

        const publicKnowledgeAssetsSubjects = publicKnowledgeAssetsTriples.map(
            ([triple]) => triple.split(' ')[0],
        );
        const publicKnowledgeAssetsStatesUALs = [];
        let newKnowledgeAssetId = firstNewKAIndex;
        for (const subject of publicKnowledgeAssetsSubjects) {
            if (preUpdateSubjectUalMap.has(subject)) {
                publicKnowledgeAssetsStatesUALs.push(preUpdateSubjectUalMap.get(subject));
            } else {
                publicKnowledgeAssetsStatesUALs.push(`${ual}/${newKnowledgeAssetId}`);
                newKnowledgeAssetId += 1;
            }
        }

        const promises = [];

        promises.push(
            this.tripleStoreModuleManager.createKnowledgeCollectionNamedGraphs(
                this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
                TRIPLE_STORE_REPOSITORY.DKG,
                publicKnowledgeAssetsStatesUALs,
                publicKnowledgeAssetsTriples,
                TRIPLES_VISIBILITY.PUBLIC,
            ),
        );

        if (triples.private?.length) {
            const privateKnowledgeAssetsTriples = this.dataService.groupTriplesBySubject(
                triples.private,
            );

            const publicSubjectsMap = new Map(
                publicKnowledgeAssetsTriples.map(([triple], index) => {
                    const [subject] = triple.split(' ');
                    return [subject, index];
                }),
            );

            const privateKnowledgeAssetsStatesUALs = privateKnowledgeAssetsTriples.reduce(
                (result, [triple]) => {
                    const [privateSubject] = triple.split(' '); // groupTriplesBySubject guarantees format
                    if (publicSubjectsMap.has(privateSubject)) {
                        result.push(
                            publicKnowledgeAssetsStatesUALs[publicSubjectsMap.get(privateSubject)],
                        );
                    }
                    return result;
                },
                [],
            );

            if (privateKnowledgeAssetsStatesUALs.length > 0) {
                promises.push(
                    this.tripleStoreModuleManager.createKnowledgeCollectionNamedGraphs(
                        this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
                        TRIPLE_STORE_REPOSITORY.DKG,
                        privateKnowledgeAssetsStatesUALs,
                        privateKnowledgeAssetsTriples,
                        TRIPLES_VISIBILITY.PRIVATE,
                    ),
                );
            }
        }
    }

    async moveKnowledgeCollectionBetweenUnifiedGraphs(fromRepository, toRepository, ual) {
        const knowledgeCollection =
            await this.tripleStoreModuleManager.getKnowledgeCollectionFromUnifiedGraph(
                this.repositoryImplementations[fromRepository],
                fromRepository,
                BASE_NAMED_GRAPHS.UNIFIED,
                ual,
                false,
            );

        // TODO: Add with the introduction of the RDF-star mode
        // const knowledgeCollectionAnnotations = this.dataService.createTripleAnnotations(
        //     knowledgeCollection,
        //     UAL_PREDICATE,
        //     `<${ual}>`,
        // );
        // const knowledgeCollectionWithAnnotations = [
        //     ...knowledgeCollection,
        //     ...knowledgeCollectionAnnotations,
        // ];

        await Promise.all([
            this.tripleStoreModuleManager.insetAssertionInNamedGraph(
                this.repositoryImplementations[toRepository],
                toRepository,
                BASE_NAMED_GRAPHS.HISTORICAL_UNIFIED,
                knowledgeCollection,
            ),
            this.tripleStoreModuleManager.deleteUniqueKnowledgeCollectionTriplesFromUnifiedGraph(
                this.repositoryImplementations[toRepository],
                toRepository,
                BASE_NAMED_GRAPHS.UNIFIED,
                ual,
            ),
        ]);
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
            );
        } else {
            this.logger.debug(`Getting Assertion with the UAL: ${ual}.`);
            nquads = await this.tripleStoreModuleManager.getKnowledgeCollectionNamedGraphs(
                this.repositoryImplementations[repository],
                repository,
                ual,
                knowledgeAssetId,
                visibility,
            );
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
            knowledgeAssetId ? `/${knowledgeAssetId}` : ''
        }`;
        this.logger.debug(`Getting Assertion Metadata with the UAL: ${ual}.`);
        let nquads;
        if (knowledgeAssetId) {
            nquads = await this.tripleStoreModuleManager.getKnowledgeAssetMetadata(
                this.repositoryImplementations[repository],
                repository,
                ual,
            );
        } else {
            nquads = await this.tripleStoreModuleManager.getKnowledgeCollectionMetadata(
                this.repositoryImplementations[repository],
                repository,
                ual,
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

    async getLatestAssertionId(repository, ual) {
        const nquads = await this.tripleStoreModuleManager.getLatestAssertionId(
            this.repositoryImplementations[repository],
            repository,
            ual,
        );

        return nquads;
    }

    async construct(query, repository = TRIPLE_STORE_REPOSITORY.DKG) {
        return this.tripleStoreModuleManager.construct(
            this.repositoryImplementations[repository] ??
                this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            repository,
            query,
        );
    }

    async moveToHistoricAndDeleteAssertion(ual, stateIndex) {
        // Find all named graph that exist for given UAL
        const ualNamedGraphs = this.tripleStoreModuleManager.findAllNamedGraphsByUAL(
            TRIPLE_STORE_REPOSITORY.DKG,
            ual,
        );
        let stateNamedGraphExistInHistoric = [];
        const ulaNamedGraphsWithState = [];
        const checkPromises = [];
        // Check if they already exist in historic
        for (const ulaNamedGraph of ualNamedGraphs) {
            const parts = ulaNamedGraph.split('/');
            parts[parts.length - 2] = `${parts[parts.length - 2]}:${stateIndex}`;
            const ulaNamedGraphWithState = parts.join('/');
            ulaNamedGraphsWithState.push(ulaNamedGraphWithState);
            checkPromises.push(
                this.tripleStoreModuleManager.namedGraphExist(
                    TRIPLE_STORE_REPOSITORY.DKG_HISTORIC,
                    ulaNamedGraphWithState,
                ),
            );
        }
        stateNamedGraphExistInHistoric = await Promise.all(checkPromises);
        // const insertPromises = [];

        // Insert them in UAL:latestStateIndex - 1 named graph in historic
        for (const [index, promiseResult] of stateNamedGraphExistInHistoric.entries()) {
            if (!promiseResult) {
                const nquads = await this.tripleStoreModuleManager.getAssertionFromNamedGraph(
                    TRIPLE_STORE_REPOSITORY.DKG,
                    ualNamedGraphs[index],
                );
                await this.tripleStoreModuleManager.insetAssertionInNamedGraph(
                    TRIPLE_STORE_REPOSITORY.DKG_HISTORIC,
                    ulaNamedGraphsWithState[index],
                    nquads,
                );
            }
        }

        await this.tripleStoreModuleManager.deleteKnowledgeCollectionNamedGraphs(
            TRIPLE_STORE_REPOSITORY.DKG,
            ualNamedGraphs,
        );

        return ualNamedGraphs;
    }

    async getKnowledgeAssetNamedGraph(repository, ual, visibility) {
        return this.tripleStoreModuleManager.getKnowledgeAssetNamedGraph(
            this.repositoryImplementations[repository],
            repository,
            ual,
            visibility,
        );
    }

    async select(query, repository = TRIPLE_STORE_REPOSITORY.DKG) {
        return this.tripleStoreModuleManager.select(
            this.repositoryImplementations[repository] ??
                this.repositoryImplementations[TRIPLE_STORE_REPOSITORY.DKG],
            repository,
            query,
        );
    }

    async queryVoid(repository, query, namedGraphs = null, labels = null) {
        return this.tripleStoreModuleManager.queryVoid(
            this.repositoryImplementations[repository],
            repository,
            this.buildQuery(query, namedGraphs, labels),
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
