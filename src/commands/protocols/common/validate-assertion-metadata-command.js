import Command from '../../command.js';
import { OPERATION_ID_STATUS } from '../../../constants/constants.js';

class ValidateAssertionMetadataCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.operationIdService = ctx.operationIdService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.dataService = ctx.dataService;
        this.operationStartEvent = OPERATION_ID_STATUS.VALIDATE_ASSERTION_METADATA_START;
        this.operationEndEvent = OPERATION_ID_STATUS.VALIDATE_ASSERTION_METADATA_END;
    }

    async execute(command) {
        const { operationId, ual, blockchain, merkleRoot, cachedMerkleRoot, byteSize, assertion } =
            command.data;

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            this.operationStartEvent,
        );

        try {
            if (merkleRoot !== cachedMerkleRoot) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Invalid Merkle Root for Knowledge Collection with UAL: ${ual}. Received value from blockchain: ${merkleRoot}, Cached value from publish operation: ${cachedMerkleRoot}`,
                    this.errorType,
                    true,
                );
            }

            const calculatedAssertionSize = this.dataService.calculateAssertionSize(
                assertion.public ?? assertion,
            );

            if (byteSize.toString() !== calculatedAssertionSize.toString()) {
                await this.handleError(
                    operationId,
                    blockchain,
                    `Invalid Assertion Size for Knowledge Collection with UAL: ${ual}. Received value from blockchain: ${byteSize}, Calculated value: ${calculatedAssertionSize}`,
                    this.errorType,
                    true,
                );
            }
        } catch (e) {
            await this.handleError(operationId, blockchain, e.message, this.errorType, true);
            return Command.empty();
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            this.operationEndEvent,
        );

        return this.continueSequence(command.data, command.sequence);
    }

    /**
     * Builds default validateAssertionMetadataCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'validateAssertionMetadataCommand',
            delay: 0,
            retries: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default ValidateAssertionMetadataCommand;
