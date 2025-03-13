import { When } from '@cucumber/cucumber';
import { expect, assert } from 'chai';
import { setTimeout } from 'timers/promises';
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
        const { operationId } = result.operation;
        this.state.latestPublishData = {
            nodeId: node - 1,
            UAL: result.UAL,
            assertionId: result.assertionId,
            operationId,
            assertion: assertions[assertionName],
            status: result.operation.status,
            errorType: result.operation.errorType,
            result,
        };
    },
);

When(
    /^I call Publish directly on the node (\d+) with ([^"]*)/,
    { timeout: 70000 },
    async function publish(node, requestName) {
        this.logger.log(`I call publish on the node ${node} directly`);
        expect(
            !!requests[requestName],
            `Request body with name: ${requestName} not found!`,
        ).to.be.equal(true);
        const requestBody = requests[requestName];
        const result = await httpApiHelper.publish(
            this.state.nodes[node - 1].nodeRpcUrl,
            requestBody,
        );
        const { operationId } = result.data;
        this.state.latestPublishData = {
            nodeId: node - 1,
            operationId,
        };
    },
);

When('I wait for latest Publish to finalize', { timeout: 80000 }, async function publishFinalize() {
    this.logger.log('I wait for latest publish to finalize');
    expect(
        !!this.state.latestPublishData,
        'Latest publish data is undefined. Publish was not started.',
    ).to.be.equal(true);
    const publishData = this.state.latestPublishData;
    let retryCount = 0;
    const maxRetryCount = 5;
    for (retryCount = 0; retryCount < maxRetryCount; retryCount += 1) {
        this.logger.log(
            `Getting publish result for operation id: ${publishData.operationId} on the node: ${publishData.nodeId}`,
        );
       
        const operationId = publishData?.result?.operation?.publish?.operationId;
        console.log("Bootstrap:", await this.state.nodes[publishData.nodeId].client.info());
        // eslint-disable-next-line no-await-in-loop
        const publishResult = await httpApiHelper.getOperationResult(
            this.state.nodes[publishData.nodeId].nodeRpcUrl,
            'publish',
            operationId,
        );

        console.log(`Operation status: ${publishResult.data.status}`);
        if (['COMPLETED', 'FAILED'].includes(publishResult.data.status)) {
            this.state.latestPublishData.result = publishResult;
            this.state.latestPublishData.status = publishResult.data.status;
            this.state.latestPublishData.errorType = publishResult.data.data?.errorType;
            break;
        }
        if (retryCount === maxRetryCount - 1) {
            assert.fail('Unable to fetch publish result');
        }
        // eslint-disable-next-line no-await-in-loop
        await setTimeout(6000);
    }
});

When(
    /I wait for (\d+) seconds and check operation status/,
    { timeout: 120000 },
    async function publishWait(numberOfSeconds) {
        this.logger.log(`I wait for ${numberOfSeconds} seconds`);
        expect(
            !!this.state.latestPublishData,
            'Latest publish data is undefined. Publish is not started.',
        ).to.be.equal(true);
        const publishData = this.state.latestPublishData;
        this.logger.log(
            `Getting publish result for operation id: ${publishData.operationId} on the node: ${publishData.nodeId}`,
        );
        await setTimeout(numberOfSeconds * 1000);
        // eslint-disable-next-line no-await-in-loop
        this.state.latestPublishData.result = await httpApiHelper.getOperationResult(
            this.state.nodes[publishData.nodeId].nodeRpcUrl,
            'publish',
            publishData.operationId,
        );
    },
);

When(
    /^I call Publish on the node (\d+) with ([^"]*) on blockchain ([^"]*) with hashFunctionId (\d+)/,
    { timeout: 120000 },
    async function publish(node, assertionName, blockchain, hashFunctionId) {
        this.logger.log(`I call publish route on the node ${node} on blockchain ${blockchain}`);

        expect(
            !!this.state.localBlockchains[blockchain],
            `Blockchain with name ${blockchain} not found`,
        ).to.be.equal(true);

        expect(
            !!assertions[assertionName],
            `Assertion with name: ${assertionName} not found!`,
        ).to.be.equal(true);

        expect(
            !Number.isInteger(hashFunctionId),
            `hashFunctionId value: ${hashFunctionId} is not an integer!`,
        ).to.be.equal(true);

        const assertion = assertions[assertionName];
        const options = {
            blockchain: this.state.nodes[node - 1].clientBlockchainOptions[blockchain],
            hashFunctionId,
        };
        const result = await this.state.nodes[node - 1].client
            .publish(assertion, options)
            .catch((error) => {
                assert.fail(`Error while trying to publish assertion. ${error}`);
            });
        const { operationId } = result.operation;
        this.state.latestPublishData = {
            nodeId: node - 1,
            UAL: result.UAL,
            assertionId: result.assertionId,
            operationId,
            assertion: assertions[assertionName],
            status: result.operation.status,
            errorType: result.operation.errorType,
            result,
        };
    },
);
