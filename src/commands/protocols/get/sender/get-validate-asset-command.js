import { kcTools } from 'assertion-tools';
import ValidateAssetCommand from '../../../common/validate-asset-command.js';
import Command from '../../../command.js';
import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    PARANET_ACCESS_POLICY,
    TRIPLE_STORE_REPOSITORIES,
    NETWORK_MESSAGE_TYPES,
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    PRIVATE_HASH_SUBJECT_PREFIX,
} from '../../../../constants/constants.js';

class GetValidateAssetCommand extends ValidateAssetCommand {
    constructor(ctx) {
        super(ctx);
        this.operationIdService = ctx.operationIdService;
        this.operationService = ctx.getService;
        this.errorType = ERROR_TYPE.GET.GET_VALIDATE_ASSET_ERROR;
        this.validationService = ctx.validationService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.paranetService = ctx.paranetService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.shardingTableService = ctx.shardingTableService;
        this.messagingService = ctx.messagingService;
    }

    async handleError(operationId, blockchain, errorMessage, errorType) {
        await this.operationService.markOperationAsFailed(
            operationId,
            blockchain,
            errorMessage,
            errorType,
        );
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const {
            operationId,
            blockchain,
            contract,
            knowledgeCollectionId,
            ual,
            paranetUAL,
            paranetSync,
            contentType,
            includeMetadata,
        } = command.data;
        let { knowledgeAssetId } = command.data;
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_VALIDATE_ASSET_START,
        );

        const { isValid, errorMessage } = await this.validateUAL(
            operationId,
            blockchain,
            contract,
            knowledgeCollectionId,
            ual,
        );
        if (!isValid) {
            await this.handleError(operationId, blockchain, errorMessage, this.errorType);
            return Command.empty();
        }

        const { isValid: paranetIsValid, errorMessage: paranetErrorMessage } =
            await this.validateParanet(operationId, paranetUAL);
        if (!paranetIsValid) {
            await this.handleError(operationId, blockchain, paranetErrorMessage, this.errorType);
            return Command.empty();
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_VALIDATE_ASSET_END,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_LOCAL_START,
        );

        if (!knowledgeAssetId) {
            try {
                knowledgeAssetId = await this.blockchainModuleManager.getKnowledgeAssetsRange(
                    blockchain,
                    contract,
                    knowledgeCollectionId,
                );
            } catch (error) {
                // Asset created on old content asset storage contract
                knowledgeAssetId = {
                    startTokenId: 1,
                    endTokenId: 1,
                    burned: [],
                };
            }
        } else {
            // kaId is number, so transform it to range
            knowledgeAssetId = {
                startTokenId: knowledgeAssetId,
                endTokenId: knowledgeAssetId,
                burned: [],
            };
        }

        let repository;
        const promises = [];
        if (paranetUAL && !paranetSync) {
            repository = this.paranetService.getParanetRepositoryName(paranetUAL);
        } else {
            repository = TRIPLE_STORE_REPOSITORIES.DKG;
        }
        const assertionPromise = this.tripleStoreService.getAssertion(
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            contentType,
            repository,
        );
        promises.push(assertionPromise);
        if (includeMetadata) {
            const metadataPromise = this.tripleStoreService.getAssertionMetadata(
                blockchain,
                contract,
                knowledgeCollectionId,
                knowledgeAssetId,
                repository,
            );
            promises.push(metadataPromise);
        }

        const [assertion, metadata] = await Promise.all(promises);

        if (!assertion?.public?.length) {
            this.handleError(
                operationId,
                blockchain,
                `Unable to locally find an asset with UAL: ${ual} ${
                    paranetUAL ? `in the paranet with UAL: ${paranetUAL}` : ''
                }`,
                this.errorType,
            );
            return Command.empty();
        }

        const responseData = {
            assertion,
            ...(includeMetadata && metadata && { metadata }),
        };
        if (assertion?.public?.length || assertion?.private?.length || assertion?.length) {
            await this.operationService.markOperationAsCompleted(
                operationId,
                blockchain,
                responseData,
                [
                    OPERATION_ID_STATUS.GET.GET_LOCAL_END,
                    OPERATION_ID_STATUS.GET.GET_END,
                    OPERATION_ID_STATUS.COMPLETED,
                ],
            );

            return Command.empty();
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_LOCAL_END,
        );

        this.logger.debug(`Searching for shard for operationId: ${operationId}`);

        const networkProtocols = this.operationService.getNetworkProtocols();

        const currentPeerId = this.networkModuleManager.getPeerId().toB58String();

        const shardNodes = await this.shardingTableService.findShard(
            blockchain,
            true, // filter inactive nodes
        );

        // TODO: Optimize this so it's returned by shardingTableService.findShard
        const foundNodes = await Promise.all(
            shardNodes.map(({ peerId }) =>
                this.shardingTableService.findPeerAddressAndProtocols(peerId),
            ),
        );

        for (const node of foundNodes) {
            if (node.id !== currentPeerId) {
                shardNodes.push({ id: node.id, protocol: networkProtocols[0] });
            }
        }

        this.logger.debug(`Found ${shardNodes.length} node(s) for operationId: ${operationId}`);
        // TODO: Log local node
        this.logger.trace(
            `Found shard: ${JSON.stringify(
                shardNodes.map((node) => node.id),
                null,
                2,
            )}`,
        );

        if (shardNodes.length < this.minAckResponses) {
            await this.handleError(
                operationId,
                blockchain,
                `Unable to find enough nodes for operationId: ${operationId}. Minimum number of nodes required: ${this.minAckResponses}`,
                this.errorType,
                true,
            );
            return Command.empty();
        }

        const message = {
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            includeMetadata,
            ual,
            paranetUAL,
        };

        // Here send messages
        // Do them in parallel in batch size, read from shardNodes and get next
        // When first is done check result
        // If success return Command.empty()
        // If failed shcedule next message to next node

        // Define batch size (adjust as necessary)
        const BATCH_SIZE = 5;
        let index = 0;

        // Process shard nodes in batches
        while (index < shardNodes.length) {
            // Slice out a batch of nodes
            const batch = shardNodes.slice(index, index + BATCH_SIZE);

            // Send messages in parallel to all nodes in the current batch
            // eslint-disable-next-line no-await-in-loop
            const results = await Promise.all(
                batch.map((node) => this.sendMessage(node, operationId, message)),
            );

            const succsesfulResult = [];
            const failedResults = [];

            results.forEach((result) => {
                if (result.success) {
                    succsesfulResult.push(result);
                } else {
                    failedResults.push(result);
                }
            });

            for (const result of succsesfulResult) {
                // eslint-disable-next-line no-await-in-loop
                const isResponseValid = await this.validateResponse(
                    result.responseData,
                    blockchain,
                    contract,
                    knowledgeCollectionId,
                    knowledgeAssetId,
                );
                if (isResponseValid) {
                    this.operationService.markOperationAsCompleted(
                        operationId,
                        blockchain,
                        result.responseData,
                        [OPERATION_ID_STATUS.GET.GET_END, OPERATION_ID_STATUS.COMPLETED],
                    );
                    return Command.empty();
                }
            }
            // Otherwise, continue with the next batch
            index += BATCH_SIZE;
        }

        await this.handleError(
            operationId,
            blockchain,
            `No node responded successfully for getValidateAssetCommand. Minimum required responses: ${this.minAckResponses}`,
            this.errorType,
        );

        return Command.empty();
    }

    async validateUAL(operationId, blockchain, contract, knowledgeCollectionId, ual) {
        const isUAL = this.ualService.isUAL(ual);

        if (!isUAL) {
            return {
                isValid: false,
                errorMessage: `Get for operation id: ${operationId}, UAL: ${ual}: is not a UAL.`,
            };
        }

        const isValidUal = await this.validationService.validateUal(
            blockchain,
            contract,
            knowledgeCollectionId,
        );

        if (!isValidUal) {
            if (!isUAL) {
                return {
                    isValid: false,
                    errorMessage: `Get for operation id: ${operationId}, UAL: ${ual}: there is no asset with this UAL.`,
                };
            }
        }
        return {
            isValid: true,
            errorMessage: null,
        };
    }

    async validateParanet(operationId, paranetUAL) {
        if (paranetUAL) {
            const {
                blockchain: paranetBlockchain,
                contract: paranetContract,
                knowledgeCollectionId: paranetKnowledgeCollectionId,
                knowledgeAssetId: paranetKnowledgeAssetId,
            } = this.ualService.resolveUAL(paranetUAL);

            if (!paranetKnowledgeAssetId) {
                return {
                    isValid: false,
                    errorMessage: `Invalid paranet UAL: ${paranetUAL} . Paranet knowledge asset token id is required!`,
                };
            }
            const isParanetUAL = this.ualService.isUAL(paranetUAL);

            if (!isParanetUAL) {
                return {
                    isValid: false,
                    errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: is not a UAL.`,
                };
            }

            const paranetId = this.paranetService.constructParanetId(
                paranetContract,
                paranetKnowledgeCollectionId,
                paranetKnowledgeAssetId,
            );

            const [paranetExists, paranetNodesAccessPolicy] = await Promise.all([
                this.blockchainModuleManager.paranetExists(paranetBlockchain, paranetId),
                this.blockchainModuleManager.getNodesAccessPolicy(paranetBlockchain, paranetId),
            ]);

            if (!paranetExists) {
                return {
                    isValid: false,
                    errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: paranet does not exist.`,
                };
            }

            if (paranetNodesAccessPolicy === PARANET_ACCESS_POLICY.CURATED) {
                return {
                    isValid: false,
                    errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: curated paranets are currently not supported.`,
                };
            }

            return {
                isValid: true,
                errorMessage: null,
            };
        }

        return { isValid: true, errorMessage: null };
    }

    async sendMessage(node, operationId, message) {
        const response = await this.messagingService.sendProtocolMessage(
            node,
            operationId,
            message,
            NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_REQUEST,
            NETWORK_MESSAGE_TIMEOUT_MILLS.GET.REQUEST,
        );
        return {
            success: response.header.messageType === NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
            responseData: response.data,
        };

        //     // eslint-disable-next-line no-await-in-loop
        //     await this.operationService.processResponse(
        //         command,
        //         OPERATION_REQUEST_STATUS.COMPLETED,
        //         responseData,
        //     );

        //     return true;
        // }
        // // eslint-disable-next-line no-await-in-loop
        // await this.operationService.processResponse(
        //     command,
        //     OPERATION_REQUEST_STATUS.FAILED,
        //     responseData,
        // );

        // return false;
    }

    async validateResponse(
        responseData,
        blockchain,
        contract,
        knowledgeCollectionId,
        knowledgeAssetId,
    ) {
        if (responseData?.assertion?.public) {
            // We can only validate whole collection not particular KA
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

                try {
                    await this.validationService.validateDatasetOnBlockchain(
                        publicKnowledgeAssetsTriplesGrouped.map((t) => t.sort()).flat(),
                        blockchain,
                        contract,
                        knowledgeCollectionId,
                    );

                    // This is added as support when get starts supporting private for curated paranet
                    // TODO: This needs to be fixed when paranets are introduced
                    if (responseData.assertion?.private?.length)
                        await this.validationService.validatePrivateMerkleRoot(
                            responseData.assertion.public,
                            responseData.assertion.private,
                        );
                } catch (e) {
                    return false;
                }
            }

            return true;
        }

        return false;
    }

    /**
     * Builds default getValidateAssetCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'getValidateAssetCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default GetValidateAssetCommand;
