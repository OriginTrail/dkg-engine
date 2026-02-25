import { When } from '@cucumber/cucumber';
import { expect, assert } from 'chai';
import HttpApiHelper from '../../../utilities/http-api-helper.mjs';

const httpApiHelper = new HttpApiHelper();

When(
    /^I get operation result from node (\d+) for latest published assertion/,
    { timeout: 120000 },
    async function resolveCall(node) {
        this.logger.log('I call get result for the latest operation');
        expect(
            !!this.state.latestPublishData,
            'Latest publish data is undefined. Publish is not finalized.',
        ).to.be.equal(true);

        try {
            const result = await this.state.nodes[node - 1].client
                .get(this.state.latestPublishData.UAL)
                .catch((error) => {
                    assert.fail(`Error while trying to resolve assertion. ${error}`);
                });

            const getOp = result.operation?.get ?? result.operation ?? {};
            const hasData = !!(result.assertion || result.public || result.data);

            // The SDK's asset.get() completes the full get flow internally.
            // If it returned with an errorType, the operation failed.
            // If it returned assertion data OR has no operationId to poll,
            // the operation completed successfully inside the SDK.
            let resolvedStatus = getOp.status || 'PENDING';
            if (getOp.errorType) {
                resolvedStatus = 'FAILED';
            } else if (hasData || !getOp.operationId) {
                resolvedStatus = 'COMPLETED';
            }

            this.state.latestGetData = {
                nodeId: node - 1,
                operationId: getOp.operationId,
                result,
                status: resolvedStatus,
                errorType: getOp.errorType,
            };
        } catch (e) {
            this.logger.log(`Error while getting operation result: ${e}`);
            this.state.latestGetData = {
                nodeId: node - 1,
                status: 'FAILED',
            };
        }
    },
);

When(
    'I wait for latest resolve to finalize',
    { timeout: 120000 },
    async function resolveFinalizeCall() {
        this.logger.log('I wait for latest resolve to finalize');
        expect(
            !!this.state.latestGetData,
            'Latest resolve data is undefined. Resolve is not started.',
        ).to.be.equal(true);

        const { nodeId, operationId, status } = this.state.latestGetData;

        if (!operationId || (status && ['COMPLETED', 'FAILED'].includes(status))) {
            this.logger.log(
                `Resolve already finalized (status: ${status}, operationId: ${operationId})`,
            );
            return;
        }

        this.logger.log(
            `Polling resolve result for operation id: ${operationId} on node: ${nodeId}`,
        );

        const result = await httpApiHelper.pollOperationResult(
            this.state.nodes[nodeId].nodeRpcUrl,
            'get',
            operationId,
            { intervalMs: 4000, maxRetries: 25 },
        );

        this.logger.log(`Resolve operation status: ${result.data.status}`);
        this.state.latestGetData.result = result;
        this.state.latestGetData.status = result.data.status;
        this.state.latestGetData.errorType = result.data.data?.errorType;
    },
);
