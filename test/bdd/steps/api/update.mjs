import { When } from '@cucumber/cucumber';
import { expect, assert } from 'chai';
import { readFile } from 'fs/promises';
import HttpApiHelper from '../../../utilities/http-api-helper.mjs';

const assertions = JSON.parse(await readFile('test/bdd/steps/api/datasets/assertions.json'));
const requests = JSON.parse(await readFile('test/bdd/steps/api/datasets/requests.json'));

const httpApiHelper = new HttpApiHelper();

When(
    /^I call Update on the node (\d+) for the latest published UAL with ([^"]*) on blockchain ([^"]*)/,
    { timeout: 120000 },
    async function update(node, assertionName, blockchain) {
        this.logger.log(`I call update route on the node ${node} on blockchain ${blockchain}`);

        expect(
            !!this.state.localBlockchains[blockchain],
            `Blockchain with name ${blockchain} not found`,
        ).to.be.equal(true);

        expect(
            !!assertions[assertionName],
            `Assertion with name: ${assertionName} not found!`,
        ).to.be.equal(true);

        const assertion = assertions[assertionName];
        const { UAL } = this.state.latestPublishData;
        const options = this.state.nodes[node - 1].clientBlockchainOptions[blockchain];
        const result = await this.state.nodes[node - 1].client
            .update(UAL, assertion, options)
            .catch((error) => {
                assert.fail(`Error while trying to update assertion. ${error}`);
            });

        const updateOp = result.operation?.update ?? result.operation ?? {};
        const resolvedStatus = result.UAL ? 'COMPLETED' : (updateOp.status || 'PENDING');
        this.state.latestUpdateData = {
            nodeId: node - 1,
            UAL: result.UAL || UAL,
            assertionId: result.assertionId,
            operationId: updateOp.operationId,
            assertion: assertions[assertionName],
            status: resolvedStatus,
            errorType: updateOp.errorType,
            result,
        };
    },
);

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

When(
    /^I call Update on the node (\d+) for the latest published UAL with ([^"]*) on blockchain ([^"]*) with hashFunctionId (\d+) and scoreFunctionId (\d+)/,
    { timeout: 120000 },
    async function updateWithHashAndScore(node, assertionName, blockchain, hashFunctionId, scoreFunctionId) {
        this.logger.log(`I call update route on the node ${node} on blockchain ${blockchain}`);

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

        expect(
            !Number.isInteger(scoreFunctionId),
            `scoreFunctionId value: ${scoreFunctionId} is not an integer!`,
        ).to.be.equal(true);

        const assertion = assertions[assertionName];
        const { UAL } = this.state.latestPublishData;
        const options = {
            blockchain: this.state.nodes[node - 1].clientBlockchainOptions[blockchain],
            hashFunctionId,
            scoreFunctionId,
        };
        const result = await this.state.nodes[node - 1].client
            .update(UAL, assertion, options)
            .catch((error) => {
                assert.fail(`Error while trying to update assertion. ${error}`);
            });

        const updateOp = result.operation?.update ?? result.operation ?? {};
        const resolvedStatus = result.UAL ? 'COMPLETED' : (updateOp.status || 'PENDING');
        this.state.latestUpdateData = {
            nodeId: node - 1,
            UAL: result.UAL || UAL,
            assertionId: result.assertionId,
            operationId: updateOp.operationId,
            assertion: assertions[assertionName],
            status: resolvedStatus,
            errorType: updateOp.errorType,
            result,
        };
    },
);
