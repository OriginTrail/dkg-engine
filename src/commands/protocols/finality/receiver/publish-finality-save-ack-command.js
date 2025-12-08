import {
    COMMAND_PRIORITY,
    NETWORK_MESSAGE_TYPES,
    OPERATION_ID_STATUS,
} from '../../../../constants/constants.js';
import Command from '../../../command.js';

class PublishFinalitySaveAckCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.protocolService = ctx.protocolService;
        this.operationService = ctx.finalityService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const { ual, publishOperationId, blockchain, operationId, remotePeerId, state } =
            command.data;

        let ualWithState = ual;
        if (state) {
            ualWithState = `${ual}:${state}`;
        }

        this.logger.debug(
            `[PUBLISH] Saving finality acknowledgment for operationId: ${operationId}, ` +
                `publishOperationId: ${publishOperationId}, UAL: ${ualWithState}, from peer: ${remotePeerId}`,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.FINALITY.PUBLISH_FINALITY_REMOTE_START,
        );

        let response;
        let success;
        try {
            await this.repositoryModuleManager.saveFinalityAck(
                publishOperationId,
                ualWithState,
                remotePeerId,
            );

            success = true;
            response = {
                messageType: NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
                messageData: { message: `Acknowledged storing of ${ualWithState}.` },
            };

            this.logger.info(
                `[PUBLISH] Finality acknowledgment saved successfully for operationId: ${operationId}, ` +
                    `publishOperationId: ${publishOperationId}, UAL: ${ualWithState}`,
            );
        } catch (err) {
            success = false;
            response = {
                messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                messageData: { errorMessage: `Failed to acknowledge storing of ${ualWithState}.` },
            };

            this.logger.warn(
                `[PUBLISH] Failed to save finality acknowledgment for operationId: ${operationId}, ` +
                    `publishOperationId: ${publishOperationId}, UAL: ${ualWithState}. Error: ${err.message}`,
            );
        }

        await this.operationService.markOperationAsCompleted(operationId, blockchain, success, [
            OPERATION_ID_STATUS.FINALITY.PUBLISH_FINALITY_REMOTE_END,
            OPERATION_ID_STATUS.COMPLETED,
        ]);

        return this.continueSequence({ ...command.data, response }, command.sequence);
    }

    /**
     * Builds default publishFinalitySaveAckCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'publishFinalitySaveAckCommand',
            delay: 0,
            transactional: false,
            priority: COMMAND_PRIORITY.HIGHEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default PublishFinalitySaveAckCommand;
