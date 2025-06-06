class LatestSyncedKcRepository {
    constructor(ctx) {
        this.model = ctx.latest_synced_kc;
    }

    async getKCStorageContracts(blockchainId) {
        return this.model.findAll({
            attributes: ['contract_address'],
            where: { blockchain: blockchainId },
        });
    }

    getSyncRecordForBlockchain(blockchainId) {
        return this.model.findAll({
            where: { blockchain: blockchainId },
        });
    }

    async addSyncContracts(blockchainId, contracts) {
        const query = `
            INSERT INTO latest_synced_kc (blockchain, contract_address)
            VALUES ${contracts.map((contract) => `('${blockchainId}', '${contract}')`).join(',')}
        `;

        return this.model.sequelize.query(query, { type: this.model.sequelize.QueryTypes.INSERT });
    }

    async updateLatestSyncedKc(blockchainId, contractAddress, latestSyncedKc, options) {
        return this.model.update(
            { latestSyncedKc },
            { where: { blockchain: blockchainId, contractAddress }, ...options },
        );
    }
}

export default LatestSyncedKcRepository;
