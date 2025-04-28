import OTNode from '../../ot-node.js';

export default class MockOTNode extends OTNode {
    async startNetworkModule() {
        this.logger.info('[Mock] Skipping startNetworkModule in test');
        // Do nothing
    }
}