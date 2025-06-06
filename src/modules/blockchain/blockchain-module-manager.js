import BaseModuleManager from '../base-module-manager.js';

class BlockchainModuleManager extends BaseModuleManager {
    getName() {
        return 'blockchain';
    }

    callImplementationFunction(blockchain, functionName, args = []) {
        if (this.getImplementation(blockchain)) {
            return this.getImplementation(blockchain).module[functionName](...args);
        }
    }

    initializeTransactionQueues(blockchain, concurrency) {
        return this.callImplementationFunction(blockchain, 'getTotalTransactionQueueLength', [
            concurrency,
        ]);
    }

    getTotalTransactionQueueLength(blockchain) {
        return this.callImplementationFunction(blockchain, 'getTotalTransactionQueueLength');
    }

    async initializeContracts(blockchain) {
        return this.callImplementationFunction(blockchain, 'initializeContracts');
    }

    initializeAssetStorageContract(blockchain, contractAddress) {
        return this.callImplementationFunction(blockchain, 'initializeAssetStorageContract', [
            contractAddress,
        ]);
    }

    initializeContract(blockchain, contractName, contractAddress) {
        return this.callImplementationFunction(blockchain, 'initializeContract', [
            contractName,
            contractAddress,
        ]);
    }

    getContractAddress(blockchain, contractName) {
        return this.callImplementationFunction(blockchain, 'getContractAddress', [contractName]);
    }

    setContractCallCache(blockchain, contractName, functionName, value) {
        return this.callImplementationFunction(blockchain, 'setContractCallCache', [
            contractName,
            functionName,
            value,
        ]);
    }

    getPublicKeys(blockchain) {
        return this.callImplementationFunction(blockchain, 'getPublicKeys');
    }

    getManagementKey(blockchain) {
        return this.callImplementationFunction(blockchain, 'getManagementKey');
    }

    async isAssetStorageContract(blockchain, contractAddress) {
        return this.callImplementationFunction(blockchain, 'isAssetStorageContract', [
            contractAddress,
        ]);
    }

    async getBlockNumber(blockchain) {
        return this.callImplementationFunction(blockchain, 'getBlockNumber');
    }

    async getIdentityId(blockchain) {
        return this.callImplementationFunction(blockchain, 'getIdentityId');
    }

    async identityIdExists(blockchain) {
        return this.callImplementationFunction(blockchain, 'identityIdExists');
    }

    async createProfile(blockchain, peerId) {
        return this.callImplementationFunction(blockchain, 'createProfile', [peerId]);
    }

    async getGasPrice(blockchain) {
        return this.callImplementationFunction(blockchain, 'getGasPrice');
    }

    async healthCheck(blockchain) {
        return this.callImplementationFunction(blockchain, 'healthCheck');
    }

    async restartService(blockchain) {
        return this.callImplementationFunction(blockchain, 'restartService');
    }

    async getKnowledgeCollectionMerkleRootByIndex(
        blockchain,
        assetStorageContractAddress,
        knowledgeCollectionId,
        index,
    ) {
        return this.callImplementationFunction(blockchain, 'getCollectionMerkleRootByIndex', [
            assetStorageContractAddress,
            knowledgeCollectionId,
            index,
        ]);
    }

    async getKnowledgeCollectionLatestMerkleRoot(
        blockchain,
        assetStorageContractAddress,
        knowledgeCollectionId,
    ) {
        return this.callImplementationFunction(
            blockchain,
            'getKnowledgeCollectionLatestMerkleRoot',
            [assetStorageContractAddress, knowledgeCollectionId],
        );
    }

    async getLatestKnowledgeCollectionId(blockchain, assetStorageContractAddress) {
        return this.callImplementationFunction(blockchain, 'getLatestKnowledgeCollectionId', [
            assetStorageContractAddress,
        ]);
    }

    getAssetStorageContractAddresses(blockchain) {
        return this.callImplementationFunction(blockchain, 'getAssetStorageContractAddresses');
    }

    async getKnowledgeCollectionMerkleRoots(
        blockchain,
        assetStorageContractAddress,
        knowledgeCollectionId,
    ) {
        return this.callImplementationFunction(blockchain, 'getKnowledgeCollectionMerkleRoots', [
            assetStorageContractAddress,
            knowledgeCollectionId,
        ]);
    }

    // async getKnowledgeAssetOwner(blockchain, assetContractAddress, tokenId) {
    //     return this.callImplementationFunction(blockchain, 'getKnowledgeAssetOwner', [
    //         assetContractAddress,
    //         tokenId,
    //     ]);
    // }

    async getLatestMerkleRootPublisher(
        blockchain,
        assetStorageContractAddress,
        knowledgeCollectionId,
    ) {
        return this.callImplementationFunction(blockchain, 'getLatestMerkleRootPublisher', [
            assetStorageContractAddress,
            knowledgeCollectionId,
        ]);
    }

    async getShardingTableHead(blockchain) {
        return this.callImplementationFunction(blockchain, 'getShardingTableHead');
    }

    async getShardingTableLength(blockchain) {
        return this.callImplementationFunction(blockchain, 'getShardingTableLength');
    }

    async getShardingTablePage(blockchain, startingIdentityId, nodesNum) {
        return this.callImplementationFunction(blockchain, 'getShardingTablePage', [
            startingIdentityId,
            nodesNum,
        ]);
    }

    async getKnowledgeCollectionSize(blockchain, knowledgeCollectionId) {
        return this.callImplementationFunction(blockchain, 'getKnowledgeCollectionSize', [
            knowledgeCollectionId,
        ]);
    }

    async getKnowledgeAssetsRange(blockchain, assetStorageContractAddress, knowledgeCollectionId) {
        return this.callImplementationFunction(blockchain, 'getKnowledgeAssetsRange', [
            assetStorageContractAddress,
            knowledgeCollectionId,
        ]);
    }

    async getParanetKnowledgeCollectionCount(blockchain, paranetId) {
        return this.callImplementationFunction(blockchain, 'getParanetKnowledgeCollectionCount', [
            paranetId,
        ]);
    }

    async getParanetKnowledgeCollectionLocatorsWithPagination(
        blockchain,
        paranetId,
        offset,
        limit,
    ) {
        return this.callImplementationFunction(
            blockchain,
            'getParanetKnowledgeCollectionLocatorsWithPagination',
            [paranetId, offset, limit],
        );
    }

    async getMinimumStake(blockchain) {
        return this.callImplementationFunction(blockchain, 'getMinimumStake');
    }

    async getMaximumStake(blockchain) {
        return this.callImplementationFunction(blockchain, 'getMaximumStake');
    }

    async getLatestBlock(blockchain) {
        return this.callImplementationFunction(blockchain, 'getLatestBlock');
    }

    async getBlockchainTimestamp(blockchain) {
        return this.callImplementationFunction(blockchain, 'getBlockchainTimestamp');
    }

    async getParanetMetadata(blockchain, paranetId) {
        return this.callImplementationFunction(blockchain, 'getParanetMetadata', [paranetId]);
    }

    async getParanetName(blockchain, paranetId) {
        return this.callImplementationFunction(blockchain, 'getParanetName', [paranetId]);
    }

    async getDescription(blockchain, paranetId) {
        return this.callImplementationFunction(blockchain, 'getDescription', [paranetId]);
    }

    async paranetExists(blockchain, paranetId) {
        return this.callImplementationFunction(blockchain, 'paranetExists', [paranetId]);
    }

    async isPermissionedNode(blockchain, paranetId, identityId) {
        return this.callImplementationFunction(blockchain, 'isPermissionedNode', [
            paranetId,
            identityId,
        ]);
    }

    async getNodesAccessPolicy(blockchain, paranetId) {
        return this.callImplementationFunction(blockchain, 'getNodesAccessPolicy', [paranetId]);
    }

    async getPermissionedNodes(blockchain, paranetId) {
        return this.callImplementationFunction(blockchain, 'getPermissionedNodes', [paranetId]);
    }

    async getNodeId(blockchain, identityId) {
        return this.callImplementationFunction(blockchain, 'getNodeId', [identityId]);
    }

    async signMessage(blockchain, messageHash) {
        return this.callImplementationFunction(blockchain, 'signMessage', [messageHash]);
    }

    async getStakeWeightedAverageAsk(blockchain) {
        return this.callImplementationFunction(blockchain, 'getStakeWeightedAverageAsk', []);
    }

    async getTimeUntilNextEpoch(blockchain) {
        return this.callImplementationFunction(blockchain, 'getTimeUntilNextEpoch', []);
    }

    async getEpochLength(blockchain) {
        return this.callImplementationFunction(blockchain, 'getEpochLength', []);
    }

    async isKnowledgeCollectionRegistered(blockchain, paranetId, knowledgeCollectionId) {
        return this.callImplementationFunction(blockchain, 'isKnowledgeCollectionRegistered', [
            paranetId,
            knowledgeCollectionId,
        ]);
    }

    async getActiveProofPeriodStatus(blockchain) {
        return this.callImplementationFunction(blockchain, 'getActiveProofPeriodStatus');
    }

    async createChallenge(blockchain) {
        return this.callImplementationFunction(blockchain, 'createChallenge', []);
    }

    async getNodeChallenge(blockchain, nodeId) {
        return this.callImplementationFunction(blockchain, 'getNodeChallenge', [nodeId]);
    }

    async submitProof(blockchain, chunk, merkleProof) {
        return this.callImplementationFunction(blockchain, 'submitProof', [chunk, merkleProof]);
    }

    async getNodeEpochProofPeriodScore(blockchain, nodeId, epoch, proofPeriodStartBlock) {
        return this.callImplementationFunction(blockchain, 'getNodeEpochProofPeriodScore', [
            nodeId,
            epoch,
            proofPeriodStartBlock,
        ]);
    }

    async getTransaction(blockchain, txHash) {
        return this.callImplementationFunction(blockchain, 'getTransaction', [txHash]);
    }

    async getBlockTimestamp(blockchain, blockNumber) {
        return this.callImplementationFunction(blockchain, 'getBlockTimestamp', [blockNumber]);
    }

    async getNodeDelegatorAddresses(blockchain, identityId) {
        return this.callImplementationFunction(blockchain, 'getNodeDelegatorAddresses', [
            identityId,
        ]);
    }

    async hasEverDelegated(blockchain, identityId, address) {
        return this.callImplementationFunction(blockchain, 'hasEverDelegated', [
            identityId,
            address,
        ]);
    }

    async getCurrentEpoch(blockchain) {
        return this.callImplementationFunction(blockchain, 'getCurrentEpoch', []);
    }

    async batchClaimDelegatorRewards(blockchain, identityId, epochs, delegators) {
        return this.callImplementationFunction(blockchain, 'batchClaimDelegatorRewards', [
            identityId,
            epochs,
            delegators,
        ]);
    }

    // SUPPORT FOR OLD CONTRACTS
    async getLatestAssertionId(blockchain, assetContractAddress, tokenId) {
        return this.callImplementationFunction(blockchain, 'getLatestAssertionId', [
            assetContractAddress,
            tokenId,
        ]);
    }

    getImplementation(name = null) {
        const keys = Object.keys(this.handlers);
        if (!keys.includes(name)) {
            throw new Error(`Blockchain: ${name} implementation is not enabled.`);
        }
        return this.handlers[name];
    }
}

export default BlockchainModuleManager;
