import { Given } from '@cucumber/cucumber';
import fs from 'fs';
import LocalBlockchain from './lib/local-blockchain.mjs';

const BLOCKCHAIN_CONFIGS = [
    { name: 'hardhat1:31337', port: 8545 },
    { name: 'hardhat2:31337', port: 9545 },
];

Given(/^the blockchains are set up$/, { timeout: 240_000 }, async function blockchainSetup() {
    await Promise.all(
        BLOCKCHAIN_CONFIGS.map(({ name, port }) => {
            this.logger.log(`Starting local blockchain ${name} on port: ${port}`);
            const blockchainConsole = new console.Console(
                fs.createWriteStream(
                    `${this.state.scenarioLogDir}/blockchain-${name.replace(':', '-')}.log`,
                ),
            );
            const localBlockchain = new LocalBlockchain();
            this.state.localBlockchains[name] = localBlockchain;
            return localBlockchain.initialize(port, blockchainConsole);
        }),
    );

    // The on-chain default minimumRequiredSignatures is 3, which requires 3 nodes in the
    // shard before a publish can succeed. Lower it to 2 so our small BDD network (1 bootstrap
    // + 2 regular nodes) can publish without running into "Unable to find enough nodes".
    // Lower the on-chain minimumRequiredSignatures for our small BDD network.
    // The ShardingTableCheckCommand syncs the on-chain sharding table into each node's
    // local DB every 10 seconds, so nodes may not see each other's profiles yet when a
    // publish arrives. Setting this to 1 ensures the publishing node itself (always in
    // its own shard) satisfies the requirement.
    for (const blockchain of Object.values(this.state.localBlockchains)) {
        await blockchain.setParametersStorageParams({ minimumRequiredSignatures: 1 });
    }
});
