export async function up({ context: { queryInterface, Sequelize } }) {
    await queryInterface.createTable('latest_synced_kc', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        blockchain: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        contract_address: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        latest_synced_kc: {
            type: Sequelize.INTEGER,
            allowNull: false,
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

    const [[{ triggerInsertExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerInsertExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_insert_latest_synced_kc';
    `);
    if (triggerInsertExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_insert_latest_synced_kc
            BEFORE INSERT ON latest_synced_kc
            FOR EACH ROW
            BEGIN
                SET NEW.created_at = NOW();
            END;
        `);
    }

    const [[{ triggerUpdateExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerUpdateExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_update_latest_synced_kc';
    `);
    if (triggerUpdateExists === 0) {
        await queryInterface.sequelize.query(`
            CREATE TRIGGER after_update_latest_synced_kc
            BEFORE UPDATE ON latest_synced_kc
            FOR EACH ROW
            BEGIN
                SET NEW.updated_at = NOW();
            END;
        `);
    }
}

export async function down({ context: { queryInterface } }) {
    await queryInterface.dropTable('latest_synced_kc');
}
