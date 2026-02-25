import { setTimeout } from 'timers/promises';
import OTNode from '../../../../ot-node.js';
import HttpApiHelper from '../../../utilities/http-api-helper.mjs';

const httpApiHelper = new HttpApiHelper();

// In small BDD test networks (3 nodes), libp2p's KadDHT periodically performs
// peer lookups that fail because the routing table is empty/sparse.  These
// surface as unhandled promise rejections which, in Node.js >= 15, terminate
// the process.  Catching them here keeps the test nodes alive.
process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const code = reason?.code;
    if (code === 'ERR_LOOKUP_FAILED' || code === 'NOT_FOUND' || code === 'NO_ROUTERS_AVAILABLE') {
        // Expected in small test networks — suppress silently.
        return;
    }
    console.error(`[test-node] Unhandled rejection: ${msg}`);
});

process.on('message', async (data) => {
    const config = JSON.parse(data);
    try {
        process.env.OPERATIONAL_DB_NAME = config.operationalDatabase.databaseName;

        // OTNode constructor reads configjson[NODE_ENV] as the default config base.
        // We must keep NODE_ENV='test' during construction so the 'test' defaults
        // (e.g. tripleStore.ot-blazegraph.enabled=true) are used.
        const newNode = new OTNode(config);

        // Switch to 'development' AFTER config is built but BEFORE start() so the
        // CommandExecutor creates per-node BullMQ queues (command-executor-{nodeName})
        // instead of a shared 'command-executor' queue that causes job stealing.
        process.env.NODE_ENV = 'development';
        await newNode.start();

        const nodeHostname = `http://localhost:${config.rpcPort}`;
        const MAX_HTTP_POLL_ATTEMPTS = 30;
        let started = false;
        for (let attempt = 0; attempt < MAX_HTTP_POLL_ATTEMPTS; attempt += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await httpApiHelper.info(nodeHostname);
                started = true;
                break;
            } catch {
                // eslint-disable-next-line no-await-in-loop
                await setTimeout(1000);
            }
        }
        if (!started) {
            throw new Error(
                `Node HTTP API on port ${config.rpcPort} did not become ready after ${MAX_HTTP_POLL_ATTEMPTS}s`,
            );
        }

        process.send({ status: 'STARTED' });
    } catch (error) {
        process.send({ error: error.message });
    }
});
