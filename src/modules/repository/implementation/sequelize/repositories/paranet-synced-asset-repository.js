// DEPRECATED
class ParanetSyncedAssetRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.model = models.paranet_synced_asset;
    }

    async createParanetSyncedAssetRecord(
        blockchainId,
        ual,
        paranetUal,
        publicAssertionId,
        privateAssertionId,
        sender,
        transactionHash,
        dataSource,
        options,
    ) {
        return this.model.create(
            {
                blockchainId,
                ual,
                paranetUal,
                publicAssertionId,
                privateAssertionId,
                sender,
                transactionHash,
                dataSource,
            },
            options,
        );
    }

    async getParanetSyncedAssetRecordByUAL(ual, options) {
        return this.model.findOne({
            where: { ual },
            ...options,
        });
    }

    async getParanetSyncedAssetRecordsCountByDataSource(paranetUal, dataSource, options) {
        return this.model.count({
            where: {
                paranetUal,
                dataSource,
            },
            ...options,
        });
    }

    async paranetSyncedAssetRecordExists(ual, options) {
        const paranetSyncedAssetRecord = await this.getParanetSyncedAssetRecordByUAL(ual, options);

        return !!paranetSyncedAssetRecord;
    }
}

export default ParanetSyncedAssetRepository;
