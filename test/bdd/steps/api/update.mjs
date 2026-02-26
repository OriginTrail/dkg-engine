import { When } from '@cucumber/cucumber';
import { expect } from 'chai';
import { readFile } from 'fs/promises';
import HttpApiHelper from '../../../utilities/http-api-helper.mjs';

const requests = JSON.parse(await readFile('test/bdd/steps/api/datasets/requests.json'));

const httpApiHelper = new HttpApiHelper();

When(
    /^I call Update directly on the node (\d+) with ([^"]*)/,
    { timeout: 70000 },
    async function updateDirect(node, requestName) {
        this.logger.log(`I call update on the node ${node} directly`);
        expect(
            !!requests[requestName],
            `Request body with name: ${requestName} not found!`,
        ).to.be.equal(true);
        const requestBody = requests[requestName];
        try {
            const result = await httpApiHelper.update(
                this.state.nodes[node - 1].nodeRpcUrl,
                requestBody,
            );
            const { operationId } = result.data;
            this.state.latestUpdateData = {
                nodeId: node - 1,
                operationId,
            };
        } catch (error) {
            this.state.latestUpdateData = {
                nodeId: node - 1,
                status: 'FAILED',
            };
        }
    },
);

When('I wait for latest Update to finalize', { timeout: 120000 }, async function updateFinalize() {
    this.logger.log('I wait for latest update to finalize');
    expect(
        !!this.state.latestUpdateData,
        'Latest update data is undefined. Update was not started.',
    ).to.be.equal(true);

    const { nodeId, operationId, status } = this.state.latestUpdateData;

    if (status && ['COMPLETED', 'FAILED'].includes(status)) {
        this.logger.log(`Update already finalized with status: ${status}`);
        return;
    }

    this.logger.log(`Polling update result for operation id: ${operationId} on node: ${nodeId}`);

    const result = await httpApiHelper.pollOperationResult(
        this.state.nodes[nodeId].nodeRpcUrl,
        'update',
        operationId,
        { intervalMs: 5000, maxRetries: 20 },
    );

    this.logger.log(`Update operation status: ${result.data.status}`);
    this.state.latestUpdateData.result = result;
    this.state.latestUpdateData.status = result.data.status;
    this.state.latestUpdateData.errorType = result.data.data?.errorType;
});

