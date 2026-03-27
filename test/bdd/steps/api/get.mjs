import { Then, When } from '@cucumber/cucumber';
import { expect, assert } from 'chai';
import { readFile } from 'fs/promises';
import HttpApiHelper from '../../../utilities/http-api-helper.mjs';

const requests = JSON.parse(await readFile('test/bdd/steps/api/datasets/requests.json'));

const httpApiHelper = new HttpApiHelper();

When(
    /^I call Get directly on the node (\d+) with ([^"]*) on blockchain ([^"]*)/,
    { timeout: 30000 },
    async function getFromNode(node, requestName, blockchain) {
        this.logger.log(`I call get directly on the node ${node} on blockchain ${blockchain}`);

        expect(
            !!this.state.localBlockchains[blockchain],
            `Blockchain with name ${blockchain} not found`,
        ).to.be.equal(true);

        expect(
            !!requests[requestName],
            `Request body with name: ${requestName} not found!`,
        ).to.be.equal(true);

        const requestBody = JSON.parse(JSON.stringify(requests[requestName]));
        requestBody.id = requestBody.id.replace('blockchain', blockchain);

        try {
            const result = await httpApiHelper.get(
                this.state.nodes[node - 1].nodeRpcUrl,
                requestBody,
            );
            const { operationId } = result.data;
            this.state.latestGetData = {
                nodeId: node - 1,
                operationId,
            };
        } catch (error) {
            this.state.latestError = error;
        }
    },
);

Then(/^It should fail with status code (\d+)/, function checkLatestError(expectedStatusCode) {
    const expectedStatusCodeInt = parseInt(expectedStatusCode, 10);
    assert(this.state.latestError, 'No error occurred');
    assert(this.state.latestError.statusCode, 'No status code in error');
    assert(
        this.state.latestError.statusCode === expectedStatusCodeInt,
        `Expected request to fail with status code ${expectedStatusCodeInt}, but it failed with another code.`,
    );
});

When('I wait for latest Get to finalize', { timeout: 120000 }, async function getFinalize() {
    this.logger.log('I wait for latest get to finalize');
    expect(
        !!this.state.latestGetData,
        'Latest get data is undefined. Get was not started.',
    ).to.be.equal(true);

    const { nodeId, operationId } = this.state.latestGetData;
    this.logger.log(`Polling get result for operation id: ${operationId} on node: ${nodeId}`);

    const result = await httpApiHelper.pollOperationResult(
        this.state.nodes[nodeId].nodeRpcUrl,
        'get',
        operationId,
        { intervalMs: 4000, maxRetries: 25 },
    );

    this.logger.log(`Get operation status: ${result.data.status}`);
    this.state.latestGetData.result = result;
    this.state.latestGetData.status = result.data.status;
    this.state.latestGetData.errorType = result.data.data?.errorType;
});

