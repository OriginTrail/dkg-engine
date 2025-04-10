export default (sequelize, DataTypes) => {
    const randomSamplingChallenge = sequelize.define(
        'random_sampling_challenge',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            blockchainId: DataTypes.STRING,
            // startDate: DataTypes.DATE,
            // endDate: DataTypes.DATE,
            knowledgeCollectionId: DataTypes.INTEGER,
            chunkNumber: DataTypes.INTEGER,
            epoch: DataTypes.INTEGER,
            activeProofPeriodStartBlock: DataTypes.BIGINT,
            finalized: DataTypes.BOOLEAN,
            sentSuccessfully: DataTypes.BOOLEAN,
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE,
        },
        { underscored: true },
    );
    randomSamplingChallenge.associate = () => {
        // associations can be defined here
    };
    return randomSamplingChallenge;
};
