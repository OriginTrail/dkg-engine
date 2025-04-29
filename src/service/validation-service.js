import { kcTools } from 'assertion-tools';
import {
    ZERO_ADDRESS,
    PRIVATE_ASSERTION_PREDICATE,
    ZERO_BYTES32,
    PRIVATE_HASH_SUBJECT_PREFIX,
} from '../constants/constants.js';

class ValidationService {
    constructor(ctx) {
        this.logger = ctx.logger;
        this.config = ctx.config;
        this.validationModuleManager = ctx.validationModuleManager;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
    }

    async validateUal(blockchain, contract, tokenId) {
        this.logger.info(
            `Validating UAL: did:dkg:${blockchain.toLowerCase()}/${contract.toLowerCase()}/${tokenId}`,
        );

        let isValid = true;
        try {
            const result = await this.blockchainModuleManager.getLatestMerkleRootPublisher(
                blockchain,
                contract,
                tokenId,
            );
            if (!result || result === ZERO_ADDRESS) {
                isValid = false;
            }
        } catch (err) {
            isValid = false;
        }

        return isValid;
    }

    async validateUalV6(blockchain, contract, tokenId) {
        this.logger.info(
            `Validating UAL: did:dkg:${blockchain.toLowerCase()}/${contract.toLowerCase()}/${tokenId}`,
        );

        let isValid = true;
        try {
            const result = await this.blockchainModuleManager.getLatestAssertionId(
                blockchain,
                contract,
                tokenId,
            );
            if (!result || result === ZERO_BYTES32) {
                isValid = false;
            }
        } catch (err) {
            isValid = false;
        }

        return isValid;
    }

    async validateAssertion(assertionId, blockchain, assertion) {
        this.logger.info(`Validating assertionId: ${assertionId}`);

        await this.validateDatasetRoot(assertion, assertionId);

        this.logger.info(`Assertion integrity validated! AssertionId: ${assertionId}`);
    }

    async validateDatasetRootOnBlockchain(
        knowledgeCollectionMerkleRoot,
        blockchain,
        assetStorageContractAddress,
        knowledgeCollectionId,
    ) {
        const blockchainAssertionRoot =
            await this.blockchainModuleManager.getKnowledgeCollectionLatestMerkleRoot(
                blockchain,
                assetStorageContractAddress,
                knowledgeCollectionId,
            );

        if (knowledgeCollectionMerkleRoot !== blockchainAssertionRoot) {
            throw new Error(
                `Merkle Root validation failed. Merkle Root on chain: ${blockchainAssertionRoot}; Calculated Merkle Root: ${knowledgeCollectionMerkleRoot}`,
            );
        }
    }

    // Used to validate assertion node received through network get
    async validateDatasetOnBlockchain(
        assertion,
        blockchain,
        assetStorageContractAddress,
        knowledgeCollectionId,
    ) {
        const knowledgeCollectionMerkleRoot = await this.validationModuleManager.calculateRoot(
            assertion,
        );

        await this.validateDatasetRootOnBlockchain(
            knowledgeCollectionMerkleRoot,
            blockchain,
            assetStorageContractAddress,
            knowledgeCollectionId,
        );
    }

    async validateDatasetRoot(dataset, datasetRoot) {
        const calculatedDatasetRoot = await this.validationModuleManager.calculateRoot(dataset);

        if (datasetRoot !== calculatedDatasetRoot) {
            throw new Error(
                `Merkle Root validation failed. Received Merkle Root: ${datasetRoot}; Calculated Merkle Root: ${calculatedDatasetRoot}`,
            );
        }
    }

    async validatePrivateMerkleRoot(publicAssertion, privateAssertion) {
        const privateAssertionTriple = publicAssertion.find((triple) =>
            triple.includes(PRIVATE_ASSERTION_PREDICATE),
        );

        if (privateAssertionTriple) {
            const privateAssertionRoot = privateAssertionTriple.split(' ')[2].replace(/['"]/g, '');
            const privateAssertionSorted = privateAssertion.sort();
            await this.validateDatasetRoot(privateAssertionSorted, privateAssertionRoot);
        }
    }

    async validateGetResponse(
        assertion,
        blockchain,
        contract,
        knowledgeCollectionId,
        knowledgeAssetId,
    ) {
        if (assertion.public) {
            // We can only validate whole collection not particular KA
            if (knowledgeAssetId) {
                const publicAssertion = assertion?.public;

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

                try {
                    await this.validateDatasetOnBlockchain(
                        publicKnowledgeAssetsTriplesGrouped.map((t) => t.sort()).flat(),
                        blockchain,
                        contract,
                        knowledgeCollectionId,
                    );

                    if (assertion?.private?.length)
                        await this.validatePrivateMerkleRoot(assertion.public, assertion.private);
                } catch (e) {
                    return false;
                }
            }

            return true;
        }

        return false;
    }
}

export default ValidationService;
