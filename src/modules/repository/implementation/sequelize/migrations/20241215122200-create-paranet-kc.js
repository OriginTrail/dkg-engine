export async function up({ context: { queryInterface, Sequelize } }) {
    await queryInterface.createTable('paranet_kc', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        blockchain_id: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        ual: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        paranet_ual: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        error_message: {
            type: Sequelize.TEXT,
            allowNull: true,
        },
        is_synced: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        retries: {
            allowNull: false,
            type: Sequelize.INTEGER,
            defaultValue: 0,
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
    const [[{ constraintExists }]] = await queryInterface.sequelize.query(`
    SELECT COUNT(*) AS constraintExists
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'paranet_kc'
      AND CONSTRAINT_NAME = 'paranet_kc_ual_paranet_ual_uk';
    `);

    if (!constraintExists) {
        await queryInterface.addConstraint('paranet_kc', {
            fields: ['ual', 'paranet_ual'],
            type: 'unique',
            name: 'paranet_kc_ual_paranet_ual_uk', // Keep the default or a custom name
        });
    }

    const [[{ indexExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS indexExists
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'paranet_kc'
          AND INDEX_NAME = 'idx_paranet_kc_sync_batch';
    `);

    if (!indexExists) {
        await queryInterface.addIndex(
            'paranet_kc',
            ['paranet_ual', 'is_synced', 'retries', 'updated_at'],
            { name: 'idx_paranet_kc_sync_batch' },
        );
    }

    const [[{ triggerInsertExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerInsertExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_insert_paranet_kc';
    `);
    if (triggerInsertExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_insert_paranet_kc
            BEFORE INSERT ON paranet_kc
            FOR EACH ROW
            BEGIN
                SET NEW.created_at = NOW();
            END;
        `);
    }

    const [[{ triggerUpdateExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerUpdateExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_update_paranet_kc';
    `);
    if (triggerUpdateExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_update_paranet_kc
            BEFORE UPDATE ON paranet_kc
            FOR EACH ROW
            BEGIN
                SET NEW.updated_at = NOW();
            END;
        `);
    }
}

export async function down({ context: { queryInterface } }) {
    const [[{ indexExists }]] = await queryInterface.sequelize.query(`
    SELECT COUNT(*) AS indexExists
    FROM information_schema.statistics
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'paranet_kc'
      AND INDEX_NAME = 'idx_paranet_kc_sync_batch';
    `);
    if (indexExists) {
        await queryInterface.removeIndex('paranet_kc', 'idx_paranet_kc_sync_batch');
    }
    await queryInterface.dropTable('paranet_kc');
}
