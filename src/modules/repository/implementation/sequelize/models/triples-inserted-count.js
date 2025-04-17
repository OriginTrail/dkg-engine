export default (sequelize, DataTypes) => {
    const TriplesInsertCount = sequelize.define(
        'triples_insert_count',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            count: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            timestamps: false,
            freezeTableName: true,
        },
    );

    return TriplesInsertCount;
};
