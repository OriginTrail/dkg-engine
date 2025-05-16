class LatestSyncedKcRepository {
    constructor(ctx) {
        this.logger = ctx.logger;
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
}

export default LatestSyncedKcRepository;
