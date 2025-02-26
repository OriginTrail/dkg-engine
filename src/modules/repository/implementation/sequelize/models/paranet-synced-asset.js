import { PARANET_SYNC_SOURCES } from '../../../../../constants/constants.js';

// NOT USED ANYMORE
export default (sequelize, DataTypes) => {
    const blockchain = sequelize.define(
        'paranet_synced_asset',
        {
            id: {
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            blockchainId: {
                allowNull: false,
                type: DataTypes.STRING,
            },
            ual: {
                allowNull: false,
                type: DataTypes.STRING,
            },
            paranetUal: {
                allowNull: false,
                type: DataTypes.STRING,
            },
            publicAssertionId: {
                allowNull: true,
                type: DataTypes.STRING,
            },
            privateAssertionId: {
                allowNull: true,
                type: DataTypes.STRING,
            },
            sender: {
                allowNull: true,
                type: DataTypes.STRING,
            },
            transactionHash: {
                allowNull: true,
                type: DataTypes.STRING,
            },
            dataSource: {
                allowNull: true,
                type: DataTypes.ENUM(...Object.values(PARANET_SYNC_SOURCES)),
            },
            createdAt: {
                type: DataTypes.DATE,
            },
            updatedAt: {
                type: DataTypes.DATE,
            },
        },
        { underscored: true },
    );
    blockchain.associate = () => {
        // associations can be defined here
    };
    return blockchain;
};
