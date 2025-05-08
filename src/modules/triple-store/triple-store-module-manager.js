import BaseModuleManager from '../base-module-manager.js';

class TripleStoreModuleManager extends BaseModuleManager {
    initializeParanetRepository(repository) {
        return this.getImplementation().module.initializeParanetRepository(repository);
    }

    async insetAssertionInNamedGraph(implementationName, repository, namedGraph, nquads) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.insetAssertionInNamedGraph(
                repository,
                namedGraph,
                nquads,
            );
        }
    }

    repositoryInitilized(repository) {
        return this.getImplementation().module.repositoryInitilized(repository);
    }

    async deleteUniqueKnowledgeCollectionTriplesFromUnifiedGraph(
        implementationName,
        repository,
        namedGraph,
        ual,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.deleteUniqueKnowledgeCollectionTriplesFromUnifiedGraph(
                repository,
                namedGraph,
                ual,
            );
        }
    }

    async getKnowledgeCollectionFromUnifiedGraph(
        implementationName,
        repository,
        namedGraph,
        ual,
        sort,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeCollectionFromUnifiedGraph(repository, namedGraph, ual, sort);
        }
    }

    async getKnowledgeCollectionPublicFromUnifiedGraph(
        implementationName,
        repository,
        namedGraph,
        ual,
        sort,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeCollectionPublicFromUnifiedGraph(
                repository,
                namedGraph,
                ual,
                sort,
            );
        }
    }

    async knowledgeCollectionExistsInUnifiedGraph(implementationName, repository, namedGraph, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.knowledgeCollectionExistsInUnifiedGraph(repository, namedGraph, ual);
        }
    }

    async deleteUniqueKnowledgeAssetTriplesFromUnifiedGraph(
        implementationName,
        repository,
        namedGraph,
        ual,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.deleteUniqueKnowledgeAssetTriplesFromUnifiedGraph(repository, namedGraph, ual);
        }
    }

    async getKnowledgeAssetFromUnifiedGraph(implementationName, repository, namedGraph, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeAssetFromUnifiedGraph(repository, namedGraph, ual);
        }
    }

    async getKnowledgeAssetPublicFromUnifiedGraph(implementationName, repository, namedGraph, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeAssetPublicFromUnifiedGraph(repository, namedGraph, ual);
        }
    }

    async knowledgeAssetExistsInUnifiedGraph(implementationName, repository, namedGraph, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.knowledgeAssetExistsInUnifiedGraph(repository, namedGraph, ual);
        }
    }

    async createKnowledgeCollectionNamedGraphs(
        implementationName,
        repository,
        uals,
        assetsNQuads,
        visibility,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.createKnowledgeCollectionNamedGraphs(
                repository,
                uals,
                assetsNQuads,
                visibility,
            );
        }
    }

    async createParanetKnoledgeCollectionConnection(
        implementationName,
        repository,
        knowledgeCollectionUal,
        paranetUAL,
        contentType,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.createParanetKnoledgeCollectionConnection(
                repository,
                knowledgeCollectionUal,
                paranetUAL,
                contentType,
            );
        }
    }

    async insertMetadataTriples(implementationName, repository, kcUal, uals, visibility) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.insertMetadataTriples(
                repository,
                kcUal,
                uals,
                visibility,
            );
        }
    }

    async deleteKnowledgeCollectionNamedGraphs(implementationName, repository, namedGraphs) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.deleteKnowledgeCollectionNamedGraphs(repository, namedGraphs);
        }
    }

    async getKnowledgeCollectionNamedGraphs(
        implementationName,
        repository,
        ual,
        knowledgeAssetId,
        visibility,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeCollectionNamedGraphs(
                repository,
                ual,
                knowledgeAssetId,
                visibility,
            );
        }
    }

    async getKnowledgeCollectionNamedGraphsInBatch(
        implementationName,
        repository,
        uals,
        visibility,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeCollectionNamedGraphsInBatch(repository, uals, visibility);
        }
    }

    async getKnowledgeCollectionNamedGraphsOld(
        implementationName,
        repository,
        ual,
        tokenIds,
        visibility,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeCollectionNamedGraphsOld(repository, ual, tokenIds, visibility);
        }
    }

    async getKnowledgeCollectionNamedGraphsOldInBatch(
        implementationName,
        repository,
        uals,
        tokenIds,
        visibility,
    ) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.getKnowledgeCollectionNamedGraphsOldInBatch(
                repository,
                uals,
                tokenIds,
                visibility,
            );
        }
    }

    async knowledgeCollectionNamedGraphsExist(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.knowledgeCollectionNamedGraphsExist(repository, ual);
        }
    }

    async deleteKnowledgeAssetNamedGraph(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.deleteKnowledgeAssetNamedGraph(
                repository,
                ual,
            );
        }
    }

    async getKnowledgeAssetNamedGraph(implementationName, repository, ual, visibility) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.getKnowledgeAssetNamedGraph(
                repository,
                ual,
                visibility,
            );
        }
    }

    async knowledgeAssetNamedGraphExists(implementationName, repository, name) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.knowledgeAssetNamedGraphExists(
                repository,
                name,
            );
        }
    }

    async insertKnowledgeCollectionMetadata(implementationName, repository, metadataNQuads) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.insertKnowledgeCollectionMetadata(repository, metadataNQuads);
        }
    }

    async deleteKnowledgeCollectionMetadata(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.deleteKnowledgeCollectionMetadata(repository, ual);
        }
    }

    async deletePublishTimestampMetadata(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.deletePublishTimestampMetadata(
                repository,
                ual,
            );
        }
    }

    async getKnowledgeCollectionMetadata(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.getKnowledgeCollectionMetadata(
                repository,
                ual,
            );
        }
    }

    async getKnowledgeAssetMetadata(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.getKnowledgeAssetMetadata(
                repository,
                ual,
            );
        }
    }

    async knowledgeCollectionMetadataExists(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(
                implementationName,
            ).module.knowledgeCollectionMetadataExists(repository, ual);
        }
    }

    async getLatestAssertionId(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.getLatestAssertionId(
                repository,
                ual,
            );
        }
    }

    async construct(implementationName, repository, query) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.construct(repository, query);
        }
    }

    async select(implementationName, repository, query) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.select(repository, query);
        }
    }

    async queryVoid(implementationName, repository, query) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.queryVoid(repository, query);
        }
    }

    async deleteRepository(implementationName, repository) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.deleteRepository(repository);
        }
    }

    async findAllNamedGraphsByUAL(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.findAllNamedGraphsByUAL(
                repository,
                ual,
            );
        }
    }

    async findAllSubjectsWithGraphNames(implementationName, repository, ual) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.findAllSubjectsWithGraphNames(
                implementationName,
                repository,
                ual,
            );
        }
    }

    async ask(implementationName, repository, query) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.ask(repository, query);
        }
    }

    getName() {
        return 'tripleStore';
    }

    // OLD REPOSITORIES SUPPORT

    async getV6Assertion(implementationName, repository, assertionId) {
        if (this.getImplementation(implementationName)) {
            return this.getImplementation(implementationName).module.getV6Assertion(
                repository,
                assertionId,
            );
        }
    }
}

export default TripleStoreModuleManager;
