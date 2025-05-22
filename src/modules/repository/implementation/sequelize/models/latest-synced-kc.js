export default (sequelize, DataTypes) => {
    const latestSyncedKc = sequelize.define(
        'latest_synced_kc',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            blockchain: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            contractAddress: {
                type: DataTypes.STRING,
                allowNull: false,
                field: 'contract_address',
            },
            latestSyncedKc: {
                type: DataTypes.INTEGER,
                allowNull: false,
                field: 'latest_synced_kc',
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

    latestSyncedKc.associate = () => {
        // associations can be defined here
    };

    return latestSyncedKc;
};
