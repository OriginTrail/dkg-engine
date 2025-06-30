import Sequelize from 'sequelize';
import { NODE_ENVIRONMENTS } from '../../../../../constants/constants.js';

class BlockchainMissedKcRepository {
    constructor(models) {
        const nodeEnv = process.env.NODE_ENV;
        if (nodeEnv === NODE_ENVIRONMENTS.DEVELOPMENT || nodeEnv === NODE_ENVIRONMENTS.TEST) {
            this.models = {
                hardhat1: models.hardhat1_sync_missed_kc,
                hardhat2: models.hardhat2_sync_missed_kc,
            };
        } else if (nodeEnv === NODE_ENVIRONMENTS.TESTNET || nodeEnv === NODE_ENVIRONMENTS.MAINNET) {
            this.models = {
                otp: models.otp_sync_missed_kc,
                gnosis: models.gnosis_sync_missed_kc,
                base: models.base_sync_missed_kc,
            };
        } else {
            throw new Error(`Invalid node environment: ${nodeEnv}`);
        }
    }

    async insertMissedKc(blockchain, records, error, options) {
        const blockchainName = blockchain.split(':')[0];
        const model = this.models[blockchainName];
        const query = `
            INSERT INTO ${blockchainName}_sync_missed_kc (kc_id, contract_address, sync_error)
            VALUES ${records
                .map((record) => `('${record.kcId}', '${record.contractAddress}', '${error}')`)
                .join(',')}
        `;
        return model.sequelize.query(query, {
            type: model.sequelize.QueryTypes.INSERT,
            ...options,
        });
    }

    async getMissedKcForRetry(blockchain, contractAddress, limit, options) {
        const blockchainName = blockchain.split(':')[0];
        const model = this.models[blockchainName];

        return model.findAll({
            where: {
                contract_address: contractAddress,
                synced: false,
                [Sequelize.Op.and]: [
                    Sequelize.literal(`
                        NOW() >= LEAST(
                            DATE_ADD(updated_at, INTERVAL POW(2, retry_count) MINUTE),
                            DATE_ADD(updated_at, INTERVAL 7 DAY)
                        )
                    `),
                ],
            },
            limit,
            ...options,
        });
    }

    async incrementRetryCount(blockchain, records, options) {
        const blockchainName = blockchain.split(':')[0];

        const kcIds = [...new Set(records.map((r) => r.kcId))];
        const contractAddresses = [...new Set(records.map((r) => r.contractAddress))];

        const model = this.models[blockchainName];
        const query = `
            UPDATE ${blockchainName}_sync_missed_kc
            SET retry_count = retry_count + 1
            WHERE kc_id IN (:kcIds)
            AND contract_address IN (:contractAddresses)
        `;

        return model.sequelize.query(query, {
            replacements: {
                kcIds,
                contractAddresses,
                blockchainId: blockchain,
            },
            type: model.sequelize.QueryTypes.UPDATE,
            ...options,
        });
    }

    async setSyncedToTrue(blockchain, records, options) {
        const blockchainName = blockchain.split(':')[0];

        const kcIds = [...new Set(records.map((r) => r.kcId))];
        const contractAddresses = [...new Set(records.map((r) => r.contractAddress))];

        const model = this.models[blockchainName];
        const query = `
            UPDATE ${blockchainName}_sync_missed_kc
            SET synced = true
            WHERE kc_id IN (:kcIds)
            AND contract_address IN (:contractAddresses)
        `;

        return model.sequelize.query(query, {
            replacements: {
                kcIds,
                contractAddresses,
                blockchainId: blockchain,
            },
            type: model.sequelize.QueryTypes.UPDATE,
            ...options,
        });
    }

    async getMissedKcForRetryCount(blockchain, contractAddress, options) {
        const blockchainName = blockchain.split(':')[0];
        const model = this.models[blockchainName];

        return model.count({
            where: { contract_address: contractAddress, synced: false },
            ...options,
        });
    }
}

export default BlockchainMissedKcRepository;
