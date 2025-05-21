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
    const [[{ blockchainContractAddressIndexExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS indexExists
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'latest_synced_kc'
          AND INDEX_NAME = 'idx_latest_synced_kc_blockchain_contract_address';
    `);
    if (!blockchainContractAddressIndexExists) {
        await queryInterface.addIndex('latest_synced_kc', ['blockchain', 'contract_address'], {
            unique: true,
            name: 'idx_latest_synced_kc_blockchain_contract_address',
        });
    }

    const [[{ blockchainIndexExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS indexExists
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'latest_synced_kc'
          AND INDEX_NAME = 'idx_latest_synced_kc_blockchain';
    `);
    if (!blockchainIndexExists) {
        await queryInterface.addIndex('latest_synced_kc', ['blockchain'], {
            name: 'idx_latest_synced_kc_blockchain',
        });
    }
}

export async function down({ context: { queryInterface } }) {
    const [[{ blockchainContractAddressIndexExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS indexExists
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'latest_synced_kc'
          AND INDEX_NAME = 'idx_latest_synced_kc_blockchain_contract_address';
    `);
    if (blockchainContractAddressIndexExists) {
        await queryInterface.removeIndex(
            'latest_synced_kc',
            'idx_latest_synced_kc_blockchain_contract_address',
        );
    }

    const [[{ blockchainIndexExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS indexExists
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'latest_synced_kc'
          AND INDEX_NAME = 'idx_latest_synced_kc_blockchain';
    `);
    if (blockchainIndexExists) {
        await queryInterface.removeIndex('latest_synced_kc', 'idx_latest_synced_kc_blockchain');
    }

    await queryInterface.dropTable('latest_synced_kc');
}
