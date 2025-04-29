export default (sequelize, DataTypes) => {
    const event = sequelize.define(
        'blockchain_event',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            contract: DataTypes.STRING,
            contractAddress: DataTypes.STRING,
            blockchain: DataTypes.STRING,
            event: DataTypes.STRING,
            data: DataTypes.TEXT,
            blockNumber: DataTypes.BIGINT,
            transactionIndex: DataTypes.BIGINT,
            logIndex: DataTypes.BIGINT,
            processed: DataTypes.BOOLEAN,
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE,
        },
        { underscored: true },
    );
    event.associate = () => {
        // associations can be defined here
    };
    return event;
};
