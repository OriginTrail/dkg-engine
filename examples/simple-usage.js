/* eslint-disable */
import { OTNodeLibrary } from '../library.js';

async function example() {
    const otNode = new OTNodeLibrary();

    try {
        // Start the node with config file
        await otNode.start('./config.json', {
            dataPath: './my-node-data',
            logLevel: 'info',
        });

        console.log('Node started successfully');
        console.log('Node is running:', otNode.isNodeRunning());

        // Access the child process
        const childProcess = otNode.getProcess();
        console.log('Child process PID:', childProcess.pid);

        // Wait for some time
        let i = 0;
        while (i < 30) {
            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
            console.log('DUMMY', i);
            i++;
        }

        // Stop the node
        await otNode.stop();
        console.log('Node stopped');
    } catch (error) {
        console.error('Error:', error);
    }
}

example().catch(console.error);
