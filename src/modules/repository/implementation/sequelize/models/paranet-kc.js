export default (sequelize, DataTypes) => {
    const paranetKC = sequelize.define(
        'paranet_kc',
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
            errorMessage: {
                allowNull: true,
                type: DataTypes.TEXT,
            },
            isSynced: {
                allowNull: false,
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
            retries: {
                allowNull: false,
                type: DataTypes.INTEGER,
                defaultValue: 0,
            },
            createdAt: {
                type: DataTypes.DATE,
            },
            updatedAt: {
                type: DataTypes.DATE,
            },
        },
        {
            underscored: true,
            indexes: [
                {
                    unique: true,
                    fields: ['ual', 'paranetUal'], // Composite unique constraint on `ual` and `paranetUal`
                },
                {
                    fields: ['paranetUal', 'isSynced', 'retries', 'updatedAt'],
                },
            ],
        },
    );

    paranetKC.associate = () => {
        // Define associations here if needed
    };

    return paranetKC;
};
