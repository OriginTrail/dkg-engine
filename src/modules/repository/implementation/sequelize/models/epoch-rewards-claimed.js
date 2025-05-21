export default (sequelize, DataTypes) => {
    const epochRewardsClaimed = sequelize.define(
        'epoch_rewards_claimed',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            blockchainId: DataTypes.STRING,
            epoch: DataTypes.INTEGER,
            claimed: DataTypes.BOOLEAN,
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE,
        },
        { underscored: true },
    );
    epochRewardsClaimed.associate = () => {
        // associations can be defined here
    };
    return epochRewardsClaimed;
};
