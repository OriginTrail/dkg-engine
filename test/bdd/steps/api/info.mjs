import { When, Then } from '@cucumber/cucumber';
import assert from 'assert';

When(/^I call Info route on the node (\d+)/, { timeout: 120000 }, async function infoRouteCall(node) {
    this.logger.log(`I call info route on the node ${node}`);
    this.state.latestInfoData = await this.state.nodes[node - 1].client.info();
});

Then(/^The node version should start with number (\d+)/, function checkNodeVersion(number) {
    assert.ok(this.state.latestInfoData, 'No info response recorded — call the info route first');
    assert.equal(
        this.state.latestInfoData.version.startsWith(number),
        true,
        `Expected version to start with ${number}, got: ${this.state.latestInfoData.version}`,
    );
});
