import axios from 'axios';
import ethers from 'ethers';
import Web3Service from '../web3-service.js';
import { GNOSIS_DEFAULT_GAS_PRICE, NODE_ENVIRONMENTS } from '../../../../constants/constants.js';

class GnosisService extends Web3Service {
    constructor(ctx) {
        super(ctx);

        this.baseTokenTicker = 'GNO';
        this.tracTicker = 'TRAC';

        this.defaultGasPrice = ethers.utils.parseUnits(
            process.env.NODE_ENV === NODE_ENVIRONMENTS.MAINNET
                ? GNOSIS_DEFAULT_GAS_PRICE.MAINNET.toString()
                : GNOSIS_DEFAULT_GAS_PRICE.TESTNET.toString(),
            'gwei',
        );
    }

    async getGasPrice() {
        let gasPrice;

        try {
            const response = await axios.get(this.config.gasPriceOracleLink);
            if (response?.data?.average) {
                // returns gwei
                gasPrice = Number(response.data.average);
                this.logger.debug(`Gas price from Gnosis oracle link: ${gasPrice} gwei`);
                gasPrice = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            } else if (response?.data?.result) {
                // returns wei
                gasPrice = Number(response.data.result, 10);
                this.logger.debug(`Gas price from Gnosis oracle link: ${gasPrice} wei`);
            } else {
                this.logger.warn(
                    `Gas price oracle: ${this.config.gasPriceOracleLink} returns gas price in unsupported format. Using default value: ${this.defaultGasPrice} Gwei.`,
                );
                return this.defaultGasPrice;
            }
        } catch (error) {
            this.logger.warn(
                `Failed to fetch the gas price from the Gnosis: ${error}. Using default value: ${this.defaultGasPrice} Gwei.`,
            );
            return this.defaultGasPrice;
        }
        if (
            gasPrice &&
            ethers.utils.parseUnits(gasPrice.toString(), 'gwei').gt(this.defaultGasPrice)
        ) {
            return gasPrice;
        }

        return this.defaultGasPrice;
    }

    async healthCheck() {
        try {
            const blockNumber = await this.getBlockNumber();
            if (blockNumber) return true;
        } catch (e) {
            this.logger.error(`Error on checking Gnosis blockchain. ${e}`);
            return false;
        }
        return false;
    }
}

export default GnosisService;
