/* eslint-disable no-await-in-loop */
import { NODE_ENVIRONMENTS } from '../../../../../constants/constants.js';

export async function up({ context: { queryInterface, Sequelize } }) {
    const nodeEnv = process.env.NODE_ENV;
    let blockchains = [];
    if (nodeEnv === NODE_ENVIRONMENTS.DEVELOPMENT || nodeEnv === NODE_ENVIRONMENTS.TEST) {
        blockchains = ['hardhat1', 'hardhat2'];
    } else if (nodeEnv === NODE_ENVIRONMENTS.TESTNET || nodeEnv === NODE_ENVIRONMENTS.MAINNET) {
        blockchains = ['otp', 'gnosis', 'base'];
    } else {
        throw new Error(`Invalid node environment: ${nodeEnv}`);
    }
    for (const blockchain of blockchains) {
        // Check if table exists
        const [[{ tableExists }]] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) AS tableExists
            FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = '${blockchain}_sync_missed_kc';
        `);
        if (tableExists === 0) {
            await queryInterface.createTable(`${blockchain}_sync_missed_kc`, {
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
                retry_count: {
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
        }

        const [[{ triggerInsertExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerInsertExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_insert_${blockchain}_sync_missed_kc';
    `);
        if (triggerInsertExists === 0) {
            await queryInterface.sequelize.query(`
            CREATE TRIGGER after_insert_${blockchain}_sync_missed_kc
            BEFORE INSERT ON ${blockchain}_sync_missed_kc
            FOR EACH ROW
            BEGIN
                SET NEW.created_at = NOW();
            END;
        `);
        }

        const [[{ triggerUpdateExists }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS triggerUpdateExists
        FROM information_schema.triggers
        WHERE trigger_schema = DATABASE() AND trigger_name = 'after_update_${blockchain}_sync_missed_kc';
    `);
        if (triggerUpdateExists === 0) {
            await queryInterface.sequelize.query(`
            CREATE TRIGGER after_update_${blockchain}_sync_missed_kc
            BEFORE UPDATE ON ${blockchain}_sync_missed_kc
            FOR EACH ROW
            BEGIN
                SET NEW.updated_at = NOW();
            END;
        `);
        }
    }
}

export async function down({ context: { queryInterface } }) {
    const nodeEnv = process.env.NODE_ENV;
    let blockchains = [];
    if (nodeEnv === NODE_ENVIRONMENTS.DEVELOPMENT || nodeEnv === NODE_ENVIRONMENTS.TEST) {
        blockchains = ['hardhat1:31337', 'hardhat2:31337'];
    } else if (nodeEnv === NODE_ENVIRONMENTS.TESTNET || nodeEnv === NODE_ENVIRONMENTS.MAINNET) {
        blockchains = ['otp', 'gnosis', 'base'];
    } else {
        throw new Error(`Invalid node environment: ${nodeEnv}`);
    }
    for (const blockchain of blockchains) {
        await queryInterface.dropTable(`${blockchain}_sync_missed_kc`);
    }
}
