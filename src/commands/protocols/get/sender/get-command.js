import { kcTools } from 'assertion-tools';
import Command from '../../../command.js';
import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    PARANET_ACCESS_POLICY,
    TRIPLE_STORE_REPOSITORIES,
    NETWORK_MESSAGE_TYPES,
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    PRIVATE_ASSERTION_PREDICATE,
    PRIVATE_HASH_SUBJECT_PREFIX,
} from '../../../../constants/constants.js';

class GetCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.operationIdService = ctx.operationIdService;
        this.ualService = ctx.ualService;
        this.operationService = ctx.getService;
        this.validationService = ctx.validationService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.paranetService = ctx.paranetService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.shardingTableService = ctx.shardingTableService;
        this.cryptoService = ctx.cryptoService;
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
            paranetNodesAccessPolicy,
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
            await this.handleError(
                operationId,
                blockchain,
                errorMessage,
                ERROR_TYPE.GET.GET_VALIDATE_ASSET_ERROR,
            );
            return Command.empty();
        }

        const currentPeerId = this.networkModuleManager.getPeerId().toB58String();
        let paranetId;
        if (paranetUAL) {
            const {
                blockchain: paranetBlockchain,
                contract: paranetContract,
                knowledgeCollectionId: paranetKnowledgeCollectionId,
                knowledgeAssetId: paranetKnowledgeAssetId,
            } = this.ualService.resolveUAL(paranetUAL);
            paranetId = this.paranetService.constructParanetId(
                paranetContract,
                paranetKnowledgeCollectionId,
                paranetKnowledgeAssetId,
            );

            const { isValid: paranetIsValid, errorMessage: paranetErrorMessage } =
                await this.validateParanet(
                    operationId,
                    paranetUAL,
                    paranetBlockchain,
                    paranetKnowledgeAssetId,
                    paranetNodesAccessPolicy,
                    paranetId,
                );
            if (!paranetIsValid) {
                await this.handleError(
                    operationId,
                    blockchain,
                    paranetErrorMessage,
                    ERROR_TYPE.GET.GET_VALIDATE_ASSET_ERROR,
                );
                return Command.empty();
            }
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

        const [assertionResult, metadata] = await Promise.all(promises);

        const assertion = assertionResult.nquads;
        knowledgeAssetId = {
            startTokenId: assertionResult.startTokenId,
            endTokenId: assertionResult.endTokenId,
            burned: [],
        };

        const responseData = {
            assertion,
            ...(includeMetadata && metadata && { metadata }),
        };
        let localGetPassed = true;
        if (paranetNodesAccessPolicy === PARANET_ACCESS_POLICY.PERMISSIONED) {
            if (Array.isArray(assertion?.public)) {
                const assertionShouldHavePrivateTriples = assertion?.public?.some((triple) =>
                    triple.includes(`${PRIVATE_ASSERTION_PREDICATE}`),
                );
                if (assertionShouldHavePrivateTriples) {
                    localGetPassed = assertion?.private?.length > 0;
                }
            } else {
                localGetPassed = false;
            }
        }
        const localGetResultValid = await this.validateResponse(
            responseData,
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
        );
        if (
            localGetPassed &&
            localGetResultValid &&
            (assertion?.public?.length || assertion?.private?.length || assertion?.length)
        ) {
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
        this.logger.debug(`Could not find asset with UAL: ${ual} locally`);

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_LOCAL_END,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_SHARD_START,
        );

        let nodesInfo = await this.findNodes(operationId, blockchain, currentPeerId);
        if (paranetNodesAccessPolicy === PARANET_ACCESS_POLICY.PERMISSIONED) {
            const permissionedNodes = await this.blockchainModuleManager.getPermissionedNodes(
                blockchain,
                paranetId,
            );
            // Awful nested loop here but small arrays
            nodesInfo = nodesInfo.filter((node) =>
                permissionedNodes.some(
                    (n) => this.cryptoService.convertHexToAscii(n.nodeId) === node.id,
                ),
            );
        }

        if (nodesInfo.length < this.minAckResponses) {
            await this.handleError(
                operationId,
                blockchain,
                `Unable to find enough nodes for operationId: ${operationId}. Minimum number of nodes required: ${this.minAckResponses}`,
                ERROR_TYPE.FIND_SHARD.GET_FIND_SHARD_ERROR,
                true,
            );
            return Command.empty();
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_SHARD_END,
        );

        const message = {
            blockchain,
            contract,
            knowledgeCollectionId,
            knowledgeAssetId,
            includeMetadata,
            ual,
            paranetUAL,
        };
        const BATCH_SIZE = 5;
        let index = 0;

        // Process shard nodes in batches
        while (index < nodesInfo.length) {
            // Slice out a batch of nodes
            const batch = nodesInfo.slice(index, index + BATCH_SIZE);

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
            `No node responded successfully for GET for ${ual}. Minimum required responses: ${this.minAckResponses}. Operation id: ${operationId}`,
            ERROR_TYPE.FIND_SHARD.GET_ERROR,
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
            return {
                isValid: false,
                errorMessage: `Get for operation id: ${operationId}, UAL: ${ual}: there is no asset with this UAL.`,
            };
        }
        return {
            isValid: true,
            errorMessage: null,
        };
    }

    async validateParanet(
        operationId,
        paranetUAL,
        paranetBlockchain,
        paranetKnowledgeAssetId,
        paranetNodeAccessPolicy,
        paranetId,
    ) {
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

        const [paranetExists, chainParanetNodesAccessPolicy] = await Promise.all([
            this.blockchainModuleManager.paranetExists(paranetBlockchain, paranetId),
            this.blockchainModuleManager.getNodesAccessPolicy(paranetBlockchain, paranetId),
        ]);

        if (!paranetExists) {
            return {
                isValid: false,
                errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: paranet does not exist.`,
            };
        }

        if (paranetNodeAccessPolicy !== chainParanetNodesAccessPolicy) {
            return {
                isValid: false,
                errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: onchain paranet access policy does not match the requested paranet access policy.`,
            };
        }

        return {
            isValid: true,
            errorMessage: null,
        };
    }

    async findNodes(operationId, blockchain, currentPeerId) {
        this.logger.debug(`Searching for shard for operationId: ${operationId}`);

        const networkProtocols = this.operationService.getNetworkProtocols();

        const shardNodes = await this.shardingTableService.findShard(blockchain, true);

        // TODO: Optimize this so it's returned by shardingTableService.findShard
        const foundNodes = await Promise.all(
            shardNodes.map(({ peerId }) =>
                this.shardingTableService.findPeerAddressAndProtocols(peerId),
            ),
        );
        const nodesInfo = [];
        for (const node of foundNodes) {
            if (node.id !== currentPeerId) {
                nodesInfo.push({ id: node.id, protocol: networkProtocols[0] });
            }
        }

        this.logger.debug(`Found ${nodesInfo.length} node(s) for operationId: ${operationId}`);
        this.logger.trace(
            `Found shard: ${JSON.stringify(
                nodesInfo.map((node) => node.id),
                null,
                2,
            )}`,
        );
        return nodesInfo;
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
     * Builds default GetCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'getCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default GetCommand;
