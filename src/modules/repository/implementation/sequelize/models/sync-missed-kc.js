export default (sequelize, DataTypes) => {
    const syncMissedKc = sequelize.define(
        'sync_missed_kc',
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
            blockchain: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'blockchain',
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

    syncMissedKc.associate = () => {
        // associations can be defined here
    };

    return syncMissedKc;
};
