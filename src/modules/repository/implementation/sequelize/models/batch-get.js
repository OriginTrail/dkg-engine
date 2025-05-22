export default (sequelize, DataTypes) => {
    const batchGet = sequelize.define(
        'batch_get',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            operationId: DataTypes.UUID,
            status: DataTypes.STRING,
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE,
        },
        { underscored: true },
    );
    batchGet.associate = () => {
        // associations can be defined here
    };
    return batchGet;
};
