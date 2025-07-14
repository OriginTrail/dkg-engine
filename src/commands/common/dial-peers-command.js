import Command from '../command.js';
import {
    DIAL_PEERS_COMMAND_FREQUENCY_MILLS,
    DIAL_PEERS_CONCURRENCY,
    MIN_DIAL_FREQUENCY_MILLIS,
    COMMAND_PRIORITY,
} from '../../constants/constants.js';

class DialPeersCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.shardingTableService = ctx.shardingTableService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute() {
        const peersToDial = await this.repositoryModuleManager.getPeersToDial(
            DIAL_PEERS_CONCURRENCY,
            MIN_DIAL_FREQUENCY_MILLIS,
        );

        if (peersToDial.length) {
            this.logger.trace(`Dialing ${peersToDial.length} remote peers`);
            await Promise.all(
                peersToDial.map(({ peerId }) => this.shardingTableService.dial(peerId)),
            );
        }

        return Command.repeat();
    }

    /**
     * Recover system from failure
     * @param command
     * @param error
     */
    async recover(command) {
        this.logger.warn(`Failed to dial peers: error: ${command.message}`);
        return Command.repeat();
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'dialPeersCommand',
            data: {},
            period: DIAL_PEERS_COMMAND_FREQUENCY_MILLS,
            priority: COMMAND_PRIORITY.MEDIUM,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default DialPeersCommand;
