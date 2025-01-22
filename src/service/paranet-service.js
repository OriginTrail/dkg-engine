class ParanetService {
    constructor(ctx) {
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.ualService = ctx.ualService;
        this.cryptoService = ctx.cryptoService;
    }

    async initializeParanetRecord(blockchain, paranetId) {
        const paranetName = await this.blockchainModuleManager.getParanetName(
            blockchain,
            paranetId,
        );
        const paranetDescription = await this.blockchainModuleManager.getDescription(
            blockchain,
            paranetId,
        );
        if (!(await this.repositoryModuleManager.paranetExists(paranetId, blockchain))) {
            await this.repositoryModuleManager.createParanetRecord(
                paranetName,
                paranetDescription,
                paranetId,
                blockchain,
            );
        }
    }

    constructParanetId(contract, tokenId) {
        return this.cryptoService.keccak256EncodePacked(
            ['address', 'uint256'],
            [contract, tokenId],
        );
    }

    constructKnowledgeAssetId(contract, tokenId) {
        return this.cryptoService.keccak256EncodePacked(
            ['address', 'uint256'],
            [contract, tokenId],
        );
    }

    getParanetRepositoryName(paranetUAL) {
        if (this.ualService.isUAL(paranetUAL)) {
            // Replace : and / with -
            return `paranet-${paranetUAL.replace(/[/:]/g, '-').toLowerCase()}`;
        }
        throw new Error(
            `Unable to get Paranet repository name. Paranet id doesn't have UAL format: ${paranetUAL}`,
        );
    }

    getParanetIdFromUAL(paranetUAL) {
        const { contract, tokenId } = this.ualService.resolveUAL(paranetUAL);
        return this.constructParanetId(contract, tokenId);
    }
}

export default ParanetService;
