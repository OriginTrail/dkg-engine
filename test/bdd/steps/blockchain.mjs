import { Given } from '@cucumber/cucumber';
import { expect } from 'chai';
import fs from 'fs';
import LocalBlockchain from './lib/local-blockchain.mjs';

Given(/^the blockchains are set up$/, { timeout: 240_000 }, function blockchainSetup(done) {

    const blockchains = [
        {name: 'hardhat1:31337', port: 8545},
        {name: 'hardhat2:31337', port: 9545}
    ]

    const promises = [];

    blockchains.forEach((blockchain, index)=>{
        this.logger.log(`Starting local blockchain ${blockchain.name} on port: ${blockchain.port}`);
        const blockchainConsole = new console.Console(
            fs.createWriteStream(`${this.state.scenarionLogDir}/blockchain-${blockchain.name.replace(':', '-')}.log`),
        );

        console.log("BLOCKCHAIN LOG: "+ `${this.state.scenarionLogDir}/blockchain-${blockchain.name.replace(':', '-')}.log`);
        const localBlockchain = new LocalBlockchain();
        this.state.localBlockchains[blockchain.name] = localBlockchain;

        promises.push(localBlockchain.initialize(blockchain.port, blockchainConsole));
    })

    Promise.all(promises).then(()=>{
        done();
    }).catch((error) => done(error));

});
