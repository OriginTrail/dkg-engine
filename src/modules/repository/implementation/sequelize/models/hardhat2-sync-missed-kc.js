export default (sequelize, DataTypes) => {
    const hardhat2SyncMissedKc = sequelize.define(
        'hardhat2_sync_missed_kc',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            kcId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                field: 'kc_id',
            },
            contractAddress: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'contract_address',
            },
            synced: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            syncError: {
                type: DataTypes.STRING,
                allowNull: true,
                field: 'sync_error',
            },
            retryCount: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                field: 'retry_count',
            },
            createdAt: {
                type: DataTypes.DATE,
                field: 'created_at',
            },
            updatedAt: {
                type: DataTypes.DATE,
                field: 'updated_at',
            },
        },
        { underscored: true },
    );

    hardhat2SyncMissedKc.associate = () => {
        // associations can be defined here
    };

    return hardhat2SyncMissedKc;
};
