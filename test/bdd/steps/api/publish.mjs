import { When } from '@cucumber/cucumber';
import { expect, assert } from 'chai';
import { readFile } from 'fs/promises';
import HttpApiHelper from '../../../utilities/http-api-helper.mjs';

const assertions = JSON.parse(await readFile('test/bdd/steps/api/datasets/assertions.json'));
const requests = JSON.parse(await readFile('test/bdd/steps/api/datasets/requests.json'));

const httpApiHelper = new HttpApiHelper();

When(
    /^I call Publish on the node (\d+) with ([^"]*) on blockchain ([^"]*)/,
    { timeout: 120000 },
    async function publish(node, assertionName, blockchain) {
        this.logger.log(`I call publish route on the node ${node} on blockchain ${blockchain}`);

        expect(
            !!this.state.localBlockchains[blockchain],
            `Blockchain with name ${blockchain} not found`,
        ).to.be.equal(true);

        expect(
            !!assertions[assertionName],
            `Assertion with name: ${assertionName} not found!`,
        ).to.be.equal(true);

        const assertion = assertions[assertionName];
        const options = this.state.nodes[node - 1].clientBlockchainOptions[blockchain];
        const result = await this.state.nodes[node - 1].client
            .publish(assertion, options)
            .catch((error) => {
                assert.fail(`Error while trying to publish assertion. ${error}`);
            });

        const publishOp = result.operation?.publish ?? {};
        this.state.latestPublishData = {
            nodeId: node - 1,
            UAL: result.UAL,
            operationId: publishOp.operationId,
            assertion: assertions[assertionName],
            status: publishOp.status || 'PENDING',
            errorType: publishOp.errorType,
            result,
        };
    },
);

When(
    /^I call Publish directly on the node (\d+) with ([^"]*)/,
    { timeout: 70000 },
    async function publishDirect(node, requestName) {
        this.logger.log(`I call publish on the node ${node} directly`);
        expect(
            !!requests[requestName],
            `Request body with name: ${requestName} not found!`,
        ).to.be.equal(true);
        const requestBody = requests[requestName];
        try {
            const result = await httpApiHelper.publish(
                this.state.nodes[node - 1].nodeRpcUrl,
                requestBody,
            );
            const { operationId } = result.data;
            this.state.latestPublishData = {
                nodeId: node - 1,
                operationId,
            };
        } catch (error) {
            this.state.latestPublishData = {
                nodeId: node - 1,
                status: 'FAILED',
                errorType: error.statusCode ? `HTTP_${error.statusCode}` : 'FAILED',
            };
        }
    },
);

When('I wait for latest Publish to finalize', { timeout: 120000 }, async function publishFinalize() {
    this.logger.log('I wait for latest publish to finalize');
    expect(
        !!this.state.latestPublishData,
        'Latest publish data is undefined. Publish was not started.',
    ).to.be.equal(true);

    const { nodeId, operationId, status } = this.state.latestPublishData;

    if (!operationId) {
        this.logger.log(`No operationId to poll, using existing status: ${status}`);
        return;
    }

    this.logger.log(`Polling publish result for operation id: ${operationId} on node: ${nodeId}`);

    const result = await httpApiHelper.pollOperationResult(
        this.state.nodes[nodeId].nodeRpcUrl,
        'publish',
        operationId,
        { intervalMs: 5000, maxRetries: 20 },
    );

    this.logger.log(`Publish operation status: ${result.data.status}`);
    this.state.latestPublishData.result = result;
    this.state.latestPublishData.status = result.data.status;
    this.state.latestPublishData.errorType = result.data.data?.errorType;
});

