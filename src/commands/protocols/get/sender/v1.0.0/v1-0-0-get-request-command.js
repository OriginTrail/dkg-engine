import { kcTools } from 'assertion-tools';
import ProtocolRequestCommand from '../../../common/protocol-request-command.js';
import {
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    ERROR_TYPE,
    OPERATION_REQUEST_STATUS,
    OPERATION_STATUS,
    PRIVATE_HASH_SUBJECT_PREFIX,
} from '../../../../../constants/constants.js';

class GetRequestCommand extends ProtocolRequestCommand {
    constructor(ctx) {
        super(ctx);
        this.operationService = ctx.getService;
        this.validationService = ctx.validationService;

        this.errorType = ERROR_TYPE.GET.GET_REQUEST_ERROR;
    }

    async shouldSendMessage(command) {
        const { operationId } = command.data;

        const { status } = await this.operationService.getOperationStatus(operationId);

        if (status === OPERATION_STATUS.IN_PROGRESS) {
            return true;
        }
        this.logger.trace(
            `${command.name} skipped for operationId: ${operationId} with status ${status}`,
        );

        return false;
    }

    async prepareMessage(command) {
        const {
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            includeMetadata,
            ual,
            paranetUAL,
            paranetId,
            isOperationV0,
            assertionId,
            isV6Contract,
        } = command.data;

        return {
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            includeMetadata,
            ual,
            paranetUAL,
            paranetId,
            isOperationV0,
            assertionId,
            isV6Contract,
        };
    }

    async handleAck(command, responseData) {
        const {
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            isOperationV0,
            isV6Contract,
        } = command.data;

        if (responseData?.assertion?.public) {
            // Only whole collection can be validated not particular KA

            if (!knowledgeAssetId) {
                const publicAssertion = responseData?.assertion?.public;

                const filteredPublic = [];
                const privateHashTriples = [];
                publicAssertion.forEach((triple) => {
                    if (triple.startsWith(`<${PRIVATE_HASH_SUBJECT_PREFIX}`)) {
                        privateHashTriples.push(triple);
                    } else {
                        filteredPublic.push(triple);
                    }
                });

                const publicKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
                    filteredPublic,
                    true,
                );
                publicKnowledgeAssetsTriplesGrouped.push(
                    ...kcTools.groupNquadsBySubject(privateHashTriples, true),
                );

                if (!isV6Contract) {
                    try {
                        await this.validationService.validateDatasetOnBlockchain(
                            publicKnowledgeAssetsTriplesGrouped.map((t) => t.sort()).flat(),
                            blockchain,
                            contract,
                            knowledgeCollectionId,
                        );
                        if (responseData.assertion?.private?.length)
                            await this.validationService.validatePrivateMerkleRoot(
                                responseData.assertion.public,
                                responseData.assertion.private,
                            );
                    } catch (e) {
                        return this.handleNack(command, {
                            errorMessage: e.message,
                        });
                    }
                }
            }

            let updatedResponseData = responseData;

            if (isOperationV0) {
                // TODO: Extract converting assertion into one array from the object into 1 function since its used for v0
                const assertion = [
                    ...(responseData.assertion?.public ?? []),
                    ...(responseData.assertion?.private ?? []),
                ];

                updatedResponseData = { ...responseData, assertion };
            }

            await this.operationService.processResponse(
                command,
                OPERATION_REQUEST_STATUS.COMPLETED,
                updatedResponseData,
            );

            return ProtocolRequestCommand.empty();
        }
        if (responseData?.assertion?.length) {
            // V6 assertion

            await this.operationService.processResponse(
                command,
                OPERATION_REQUEST_STATUS.COMPLETED,
                responseData,
            );

            return ProtocolRequestCommand.empty();
        }

        return this.handleNack(command, responseData);
    }

    messageTimeout() {
        return NETWORK_MESSAGE_TIMEOUT_MILLS.GET.REQUEST;
    }

    /**
     * Builds default getRequest
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'v1_0_0GetRequestCommand',
            delay: 0,
            retries: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default GetRequestCommand;
