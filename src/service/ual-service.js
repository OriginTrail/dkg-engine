class UALService {
    constructor(ctx) {
        this.config = ctx.config;
        this.logger = ctx.logger;

        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.cryptoService = ctx.cryptoService;
    }

    deriveUAL(blockchain, contract, knowledgeCollectionId, knowledgeAssetId) {
        const ual = `did:dkg:${blockchain.toLowerCase()}/${contract.toLowerCase()}/${knowledgeCollectionId}`;
        return knowledgeAssetId ? `${ual}/${knowledgeAssetId}` : ual;
    }

    // did:dkg:otp:2043/0x123231/5
    isUAL(ual) {
        if (!ual.startsWith('did:dkg:')) return false;
        const parts = ual.replace('did:', '').replace('dkg:', '').split('/');
        parts.push(...parts.pop().split(':'));
        if (parts.length === 4) {
            return (
                this.isContract(parts[1]) &&
                !Number.isNaN(Number(parts[2])) &&
                !Number.isNaN(Number(parts[3]))
            );
        }
        if (parts.length === 3) {
            // eslint-disable-next-line no-restricted-globals
            return this.isContract(parts[1]) && !Number.isNaN(Number(parts[2]));
        }
        if (parts.length === 2) {
            const parts2 = parts[0].split(':');
            // eslint-disable-next-line no-restricted-globals
            if (parts2.length === 3) {
                return (
                    parts2.length === 2 &&
                    this.isContract(parts2[2]) &&
                    !Number.isNaN(Number(parts[1]))
                );
            }
            return (
                parts2.length === 2 && this.isContract(parts2[1]) && !Number.isNaN(Number(parts[1]))
            );
        }
    }

    resolveUAL(ual) {
        const parts = ual.replace('did:', '').replace('dkg:', '').split('/');
        // TODO: Resolve UAL with state
        // parts.push(...parts.pop().split(':'));
        if (parts.length === 4) {
            const contract = parts[1];
            if (!this.isContract(contract)) {
                throw new Error(`Invalid contract format: ${contract}`);
            }
            let blockchainName = parts[0];
            if (blockchainName.split(':').length === 1) {
                for (const implementation of this.blockchainModuleManager.getImplementationNames()) {
                    if (implementation.split(':')[0] === blockchainName) {
                        blockchainName = implementation;
                        break;
                    }
                }
            }
            return {
                blockchain: blockchainName,
                contract,
                knowledgeCollectionId: Number(parts[2]),
                knowledgeAssetId: Number(parts[3]),
            };
        }
        if (parts.length === 3) {
            const contract = parts[1];
            if (!this.isContract(contract)) {
                throw new Error(`Invalid contract format: ${contract}`);
            }
            let blockchainName = parts[0];
            if (blockchainName.split(':').length === 1) {
                for (const implementation of this.blockchainModuleManager.getImplementationNames()) {
                    if (implementation.split(':')[0] === blockchainName) {
                        blockchainName = implementation;
                        break;
                    }
                }
            }
            return {
                blockchain: blockchainName,
                contract,
                knowledgeCollectionId: Number(parts[2]),
            };
        }
        if (parts.length === 2) {
            const parts2 = parts[0].split(':');
            if (parts2.length === 3) {
                const contract = parts2[2];
                if (!this.isContract(contract)) {
                    throw new Error(`Invalid contract format: ${contract}`);
                }
                return { blockchain: parts2[0] + parts2[1], contract, tokenId: Number(parts[1]) };
            }
            if (parts2.length === 2) {
                let blockchainWithId;
                for (const implementation of this.blockchainModuleManager.getImplementationNames()) {
                    if (implementation.split(':')[0] === blockchainWithId) {
                        blockchainWithId = implementation;
                        break;
                    }
                }
                const contract = parts2[1];
                if (!this.isContract(contract)) {
                    throw new Error(`Invalid contract format: ${contract}`);
                }
                return { blockchain: blockchainWithId, contract, tokenId: Number(parts[1]) };
            }
        }

        throw new Error(`UAL doesn't have correct format: ${ual}`);
    }

    isContract(contract) {
        const contractRegex = /^0x[a-fA-F0-9]{40}$/;
        return contractRegex.test(contract);
    }

    // TODO: Do we need still need this
    async calculateLocationKeyword(
        blockchain,
        contract,
        knowledgeCollectionId,
        assertionId = null,
    ) {
        const firstAssertionId =
            assertionId ??
            (await this.blockchainModuleManager.getKnowledgeCollectionMerkleRootByIndex(
                blockchain,
                contract,
                knowledgeCollectionId,
                0,
            ));
        return this.cryptoService.encodePacked(
            ['address', 'bytes32'],
            [contract, firstAssertionId],
        );
    }

    getUalWithoutChainId(ual, blockchain) {
        const blockchainParts = blockchain.split(':');

        if (ual.includes(blockchain)) {
            return ual.replace(blockchain, blockchainParts[0]);
        }
        return ual;
    }
}

export default UALService;
