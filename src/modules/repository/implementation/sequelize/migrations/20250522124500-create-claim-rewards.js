export const up = async ({ context: { queryInterface, Sequelize } }) => {
    await queryInterface.createTable('epoch_rewards_claimed', {
        id: {
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
        },
        blockchain_id: {
            allowNull: false,
            type: Sequelize.STRING,
        },
        epoch: {
            allowNull: false,
            type: Sequelize.INTEGER,
        },
        claimed: {
            allowNull: false,
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        },
        created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('NOW()'),
        },
    });

    const [[{ indexExists: epochRewardsClaimedIdxEpochRewardsClaimedExists }]] =
        await queryInterface.sequelize.query(`
          SELECT COUNT(*) AS indexExists
          FROM information_schema.statistics
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'epoch_rewards_claimed'
          AND INDEX_NAME = 'idx_epoch_rewards_claimed';
    `);

    if (!epochRewardsClaimedIdxEpochRewardsClaimedExists) {
        await queryInterface.addIndex('epoch_rewards_claimed', ['blockchain_id', 'claimed'], {
            name: 'idx_epoch_rewards_claimed',
        });
    }

    const [[{ indexExists: epochRewardsClaimedIdxEpochExists }]] = await queryInterface.sequelize
        .query(`
          SELECT COUNT(*) AS indexExists
          FROM information_schema.statistics
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'epoch_rewards_claimed'
          AND INDEX_NAME = 'idx_epoch';
    `);

    if (!epochRewardsClaimedIdxEpochExists) {
        await queryInterface.addIndex('epoch_rewards_claimed', ['blockchain_id', 'epoch'], {
            name: 'idx_epoch',
        });
    }

    const [[{ triggerInsertExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerInsertExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_insert_epoch_rewards_claimed';
    `);
    if (triggerInsertExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_insert_epoch_rewards_claimed
            BEFORE INSERT ON epoch_rewards_claimed
            FOR EACH ROW
            BEGIN
                SET NEW.created_at = NOW();
            END;
        `);
    }

    const [[{ triggerUpdateExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerUpdateExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_update_epoch_rewards_claimed';
    `);
    if (triggerUpdateExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_update_epoch_rewards_claimed
            BEFORE UPDATE ON epoch_rewards_claimed
            FOR EACH ROW
            BEGIN
                SET NEW.updated_at = NOW();
            END;
        `);
    }
};

export const down = async ({ context: { queryInterface } }) => {
    const [[{ indexExists: epochRewardsClaimedIdxEpochRewardsClaimedExists }]] =
        await queryInterface.sequelize.query(`
          SELECT COUNT(*) AS indexExists
          FROM information_schema.statistics
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'epoch_rewards_claimed'
          AND INDEX_NAME = 'idx_epoch_rewards_claimed';
    `);
    if (epochRewardsClaimedIdxEpochRewardsClaimedExists) {
        await queryInterface.removeIndex('epoch_rewards_claimed', 'idx_epoch_rewards_claimed');
    }
    await queryInterface.dropTable('epoch_rewards_claimed');

    const [[{ indexExists: epochRewardsClaimedIdxEpochExists }]] = await queryInterface.sequelize
        .query(`
          SELECT COUNT(*) AS indexExists
          FROM information_schema.statistics
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'epoch_rewards_claimed'
          AND INDEX_NAME = 'idx_epoch';
    `);
    if (epochRewardsClaimedIdxEpochExists) {
        await queryInterface.removeIndex('epoch_rewards_claimed', 'idx_epoch');
    }
    await queryInterface.dropTable('epoch_rewards_claimed');
};
