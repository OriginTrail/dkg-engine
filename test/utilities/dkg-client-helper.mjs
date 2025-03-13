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
            environment: 'development',
        };

        const options = { ...defaultOptions, ...userOptions };

        return this.client.asset.create(data, options);
    }

    async update(ual, assertion, userOptions = {}) {
        const defaultOptions = {
            hashFunctionId: CONTENT_ASSET_HASH_FUNCTION_ID,
        };

        const options = { ...defaultOptions, ...userOptions };

        return this.client.asset.update(ual, assertion, options);
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

    async getBidSuggestion(publicAssertionId, sizeInBytes, userOptions = {}) {
        const defaultOptions = {
            epochsNum: 2,
        };

        const options = { ...defaultOptions, ...userOptions };

        return this.client.network.getBidSuggestion(publicAssertionId, sizeInBytes, options);
    }

    async getPublicAssertionId(content) {
        return this.client.assertion.getPublicAssertionId(content);
    }

    async getSizeInBytes(content) {
        return this.client.assertion.getSizeInBytes(content);
    }
}

export default DkgClientHelper;
