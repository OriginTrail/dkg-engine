import DKG from 'dkg.js';
import { CONTENT_ASSET_HASH_FUNCTION_ID } from '../../src/constants/constants.js';

class DkgClientHelper {
    constructor(config) {
        this.client = new DKG(config);
    }

    async info() {
        return this.client.node.info();
    }

    async publish(data, userOptions = {}) {
        const defaultOptions = {
            visibility: 'public',
            epochsNum: 5,
            hashFunctionId: CONTENT_ASSET_HASH_FUNCTION_ID,
            minimumNumberOfNodeReplications: 1,
            minimumNumberOfFinalizationConfirmations: 0,
        };

        const options = { ...defaultOptions, ...userOptions };

        return this.client.asset.create(data, options);
    }

    async get(ual, state, userOptions = {}) {
        const defaultOptions = {
            state,
            validate: true,
        };

        const options = { ...defaultOptions, ...userOptions };

        return this.client.asset.get(ual, options);
    }

    async query(query) {
        return this.client.query(query);
    }
}

export default DkgClientHelper;
