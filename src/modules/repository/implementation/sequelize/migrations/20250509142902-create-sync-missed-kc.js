export async function up({ context: { queryInterface, Sequelize } }) {
    await queryInterface.createTable('sync_missed_kc', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        kc_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        contract_address: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        synced: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        sync_error: {
            type: Sequelize.STRING,
            allowNull: true,
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

    const [[{ triggerInsertExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerInsertExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_insert_sync_missed_kc';
    `);
    if (triggerInsertExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_insert_sync_missed_kc
            BEFORE INSERT ON sync_missed_kc
            FOR EACH ROW
            BEGIN
                SET NEW.created_at = NOW();
            END;
        `);
    }

    const [[{ triggerUpdateExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerUpdateExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_update_sync_missed_kc';
    `);
    if (triggerUpdateExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_update_sync_missed_kc
            BEFORE UPDATE ON sync_missed_kc
            FOR EACH ROW
            BEGIN
                SET NEW.updated_at = NOW();
            END;
        `);
    }
}

export async function down({ context: { queryInterface } }) {
    await queryInterface.dropTable('sync_missed_kc');
}
