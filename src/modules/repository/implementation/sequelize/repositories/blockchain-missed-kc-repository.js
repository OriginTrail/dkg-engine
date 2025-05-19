import { NODE_ENVIRONMENTS } from '../../../../../constants/constants.js';

class SyncMissedKcRepository {
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
}

export default SyncMissedKcRepository;
