export const up = async ({ context: { queryInterface, Sequelize } }) => {
    await queryInterface.createTable('random_sampling_challenge', {
        id: {
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
        },
        blockchain_id: {
            allowNull: false,
            type: Sequelize.STRING,
        },
        start_date: {
            allowNull: false,
            type: Sequelize.DATE,
        },
        end_date: {
            allowNull: false,
            type: Sequelize.DATE,
        },
        knowledge_collection_id: {
            allowNull: false,
            type: Sequelize.INTEGER,
        },
        chunk_number: {
            allowNull: false,
            type: Sequelize.INTEGER,
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

    const [[{ indexExists }]] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS indexExists
      FROM information_schema.statistics
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'random_sampling_challenge'
        AND INDEX_NAME = 'idx_random_sampling_blockchain_id_start_date';
  `);

    if (!indexExists) {
        await queryInterface.addIndex(
            'random_sampling_challenge',
            ['blockchain_id', 'start_date'],
            { name: 'idx_random_sampling_blockchain_id_start_date' },
        );
    }

    const [[{ triggerInsertExists }]] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS triggerInsertExists
      FROM information_schema.triggers
      WHERE trigger_schema = DATABASE() AND trigger_name = 'after_insert_random_sampling_challenge';
  `);
    if (triggerInsertExists === 0) {
        await queryInterface.sequelize.query(`
          CREATE TRIGGER after_insert_random_sampling_challenge
          BEFORE INSERT ON random_sampling_challenge
          FOR EACH ROW
          BEGIN
              SET NEW.created_at = NOW();
          END;
      `);
    }

    const [[{ triggerUpdateExists }]] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS triggerUpdateExists
      FROM information_schema.triggers
      WHERE trigger_schema = DATABASE() AND trigger_name = 'after_update_random_sampling_challenge';
  `);
    if (triggerUpdateExists === 0) {
        await queryInterface.sequelize.query(`
          CREATE TRIGGER after_update_random_sampling_challenge
          BEFORE UPDATE ON random_sampling_challenge
          FOR EACH ROW
          BEGIN
              SET NEW.updated_at = NOW();
          END;
      `);
    }
};

export const down = async ({ context: { queryInterface } }) => {
    const [[{ indexExists }]] = await queryInterface.sequelize.query(`
    SELECT COUNT(*) AS indexExists
    FROM information_schema.statistics
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'random_sampling_challenge'
      AND INDEX_NAME = 'idx_random_sampling_blockchain_id_start_date';
    `);
    if (indexExists) {
        await queryInterface.removeIndex(
            'random_sampling_challenge',
            'idx_random_sampling_blockchain_id_start_date',
        );
    }
    await queryInterface.dropTable('random_sampling_challenge');
};
