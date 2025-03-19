import Command from '../../command.js';
import { OPERATION_ID_STATUS, ERROR_TYPE } from '../../../constants/constants.js';

class FindShardCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.networkModuleManager = ctx.networkModuleManager;
        this.shardingTableService = ctx.shardingTableService;
        this.errorType = ERROR_TYPE.FIND_SHARD.FIND_SHARD_ERROR;
        this.operationStartEvent = OPERATION_ID_STATUS.FIND_NODES_START;
        this.operationEndEvent = OPERATION_ID_STATUS.FIND_NODES_END;
    }

    // eslint-disable-next-line no-unused-vars
    getOperationCommandSequence(nodePartOfShard, commandData) {
        return [];
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const { operationId, blockchain, datasetRoot, minimumNumberOfNodeReplications } =
            command.data;
        this.logger.debug(
            `Searching for shard for operationId: ${operationId}, dataset root: ${datasetRoot}`,
        );
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            this.operationStartEvent,
        );

        this.minAckResponses = this.operationService.getMinAckResponses(
            minimumNumberOfNodeReplications,
        );

        const networkProtocols = this.operationService.getNetworkProtocols();

        const shardNodes = [];
        let nodePartOfShard = false;
        const currentPeerId = this.networkModuleManager.getPeerId().toB58String();

        const foundNodes = await this.findShardNodes(blockchain);

        for (const node of foundNodes) {
            if (node.id === currentPeerId) {
                nodePartOfShard = true;
            } else {
                shardNodes.push({ id: node.id, protocol: networkProtocols[0] });
            }
        }

        const commandSequence = this.getOperationCommandSequence(nodePartOfShard, command.data);

        command.sequence.push(...commandSequence);

        this.logger.debug(
            `Found ${
                shardNodes.length + (nodePartOfShard ? 1 : 0)
            } node(s) for operationId: ${operationId}`,
        );
        // TODO: Log local node
        this.logger.trace(
            `Found shard: ${JSON.stringify(
                shardNodes.map((node) => node.id),
                null,
                2,
            )}`,
        );

        if (shardNodes.length + (nodePartOfShard ? 1 : 0) < this.minAckResponses) {
            await this.handleError(
                operationId,
                blockchain,
                `Unable to find enough nodes for operationId: ${operationId}. Minimum number of nodes required: ${this.minAckResponses}`,
                this.errorType,
                true,
            );
            return Command.empty();
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            this.operationEndEvent,
        );

        return this.continueSequence(
            {
                ...command.data,
                nodePartOfShard,
                leftoverNodes: shardNodes,
                numberOfFoundNodes: shardNodes.length + (nodePartOfShard ? 1 : 0),
            },
            command.sequence,
        );
    }

    async findShardNodes(blockchainId) {
        const shardNodes = await this.shardingTableService.findShard(
            blockchainId,
            true, // filter inactive nodes
        );

        // TODO: Optimize this so it's returned by shardingTableService.findShard
        const nodesFound = await Promise.all(
            shardNodes.map(({ peerId }) =>
                this.shardingTableService.findPeerAddressAndProtocols(peerId),
            ),
        );

        return nodesFound;
    }

    /**
     * Builds default findShardCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'findShardCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default FindShardCommand;
