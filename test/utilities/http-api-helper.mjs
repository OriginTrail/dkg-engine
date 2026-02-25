import { setTimeout } from 'timers/promises';
import axios from 'axios';

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED'];

class HttpApiHelper {
    async info(nodeRpcUrl) {
        return this._sendRequest('get', `${nodeRpcUrl}/info`);
    }

    async get(nodeRpcUrl, requestBody) {
        return this._sendRequest('post', `${nodeRpcUrl}/get`, requestBody);
    }

    async getOperationResult(nodeRpcUrl, operationName, operationId) {
        return this._sendRequest('get', `${nodeRpcUrl}/${operationName}/${operationId}`);
    }

    async publish(nodeRpcUrl, requestBody) {
        return this._sendRequest('post', `${nodeRpcUrl}/publish`, requestBody);
    }

    async update(nodeRpcUrl, requestBody) {
        return this._sendRequest('post', `${nodeRpcUrl}/update`, requestBody);
    }

    /**
     * Polls an operation until it reaches a terminal status (COMPLETED or FAILED).
     * @param {string} nodeRpcUrl
     * @param {string} operationName  e.g. 'publish', 'get', 'update'
     * @param {string} operationId
     * @param {object} [options]
     * @param {number} [options.intervalMs=5000]  delay between retries
     * @param {number} [options.maxRetries=5]
     * @returns {Promise<object>} the final operation result response
     */
    async pollOperationResult(nodeRpcUrl, operationName, operationId, { intervalMs = 5000, maxRetries = 5 } = {}) {
        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop
            const result = await this.getOperationResult(nodeRpcUrl, operationName, operationId);
            if (TERMINAL_STATUSES.includes(result.data.status)) {
                return result;
            }
            if (attempt < maxRetries - 1) {
                // eslint-disable-next-line no-await-in-loop
                await setTimeout(intervalMs);
            }
        }
        throw new Error(
            `Operation ${operationName}/${operationId} did not reach a terminal status after ${maxRetries} attempts`,
        );
    }

    async _sendRequest(method, url, data) {
        return axios({
            method,
            url,
            ...data && { data },
        }).catch((error) => {
            const errorWithStatus = new Error(error.message);
            if (error.response) {
                errorWithStatus.statusCode = error.response.status;
            }
            throw errorWithStatus;
        });
    }
}
export default HttpApiHelper;
