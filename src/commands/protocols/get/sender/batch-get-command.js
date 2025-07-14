import { kcTools } from 'assertion-tools';
import fs from 'fs/promises';
import path from 'path';
import Command from '../../../command.js';
import {
    OPERATION_ID_STATUS,
    ERROR_TYPE,
    TRIPLE_STORE_REPOSITORIES,
    NETWORK_MESSAGE_TYPES,
    NETWORK_MESSAGE_TIMEOUT_MILLS,
    MIGRATION_FLAG_PATH,
    PRIVATE_HASH_SUBJECT_PREFIX,
    OPERATION_STATUS,
    BATCH_GET_BATCH_SIZE as BATCH_SIZE,
    TRIPLE_STORE_REPOSITORY,
    TRIPLES_VISIBILITY,
    COMMAND_PRIORITY,
} from '../../../../constants/constants.js';

class BatchGetCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.operationIdService = ctx.operationIdService;
        this.ualService = ctx.ualService;
        this.operationService = ctx.batchGetService;
        this.validationService = ctx.validationService;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.paranetService = ctx.paranetService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.networkModuleManager = ctx.networkModuleManager;
        this.shardingTableService = ctx.shardingTableService;
        this.cryptoService = ctx.cryptoService;
        this.messagingService = ctx.messagingService;
        this.tripleStoreModuleManager = ctx.tripleStoreModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
    }

    async handleError(operationId, blockchain, errorMessage, errorType) {
        await this.operationService.markOperationAsFailed(
            operationId,
            blockchain,
            errorMessage,
            errorType,
        );
        this.operationIdService.emitChangeEvent(
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_FAILED,
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
            uals,
            // paranetUAL,
            // paranetSync,
            contentType,
            includeMetadata,
            paranetNodesAccessPolicy,
        } = command.data;

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_START,
        );

        await this.repositoryModuleManager.createOperationRecord(
            this.operationService.getOperationName(),
            operationId,
            OPERATION_STATUS.IN_PROGRESS,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_VALIDATE_ASSET_START,
        );

        const { isValid, errorMessage } = await this.validateUALs(operationId, blockchain, uals);

        if (!isValid) {
            await this.handleError(
                operationId,
                blockchain,
                errorMessage,
                ERROR_TYPE.BATCH_GET.BATCH_GET_VALIDATE_ASSET_ERROR,
            );
            return Command.empty();
        }

        const currentPeerId = this.networkModuleManager.getPeerId().toB58String();
        // let paranetId;
        const repository = TRIPLE_STORE_REPOSITORIES.DKG;
        let migrationFlag = '0';
        const migrationFlagPath = path.join(process.cwd(), MIGRATION_FLAG_PATH);
        try {
            migrationFlag = await fs.readFile(migrationFlagPath, 'utf8');
            migrationFlag = migrationFlag.trim();
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.logger.warn(
                    `Migration flag file not found at ${migrationFlagPath}, using default value '${migrationFlag}'`,
                );
            } else {
                throw error;
            }
        }
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_VALIDATE_ASSET_END,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_LOCAL_START,
        );

        const tokenIds = {};

        const tokenIdPromises = uals.map(async (ual) => {
            const { contract, knowledgeCollectionId } = this.ualService.resolveUAL(ual);
            try {
                tokenIds[ual] = await this.blockchainModuleManager.getKnowledgeAssetsRange(
                    blockchain,
                    contract,
                    knowledgeCollectionId,
                );
            } catch (error) {
                // Asset created on old content asset storage contract
                tokenIds[ual] = {
                    startTokenId: 1,
                    endTokenId: 1,
                    burned: [],
                };
            }
        });

        await Promise.all(tokenIdPromises);

        const promises = [];
        const assertionPromise = this.tripleStoreService.getAssertionsInBatch(
            TRIPLE_STORE_REPOSITORY.DKG,
            uals,
            tokenIds,
            TRIPLES_VISIBILITY.PUBLIC,
        );
        promises.push(assertionPromise);

        const [batchAssertions] = await Promise.all(promises);

        const finalResult = { local: [], remote: {}, metadata: {} };

        const localGetResultValid = await this.validateBatchResponse(
            batchAssertions,
            blockchain,
            paranetNodesAccessPolicy,
            contentType,
            finalResult,
        );

        // Filter what we have locally and add those ual to finalResult local
        const ualPresentLocally = Object.keys(localGetResultValid).filter(
            (ual) => localGetResultValid[ual],
        );
        const ualNotPresentLocally = Object.keys(localGetResultValid).filter(
            (ual) => !localGetResultValid[ual],
        );

        ualPresentLocally.forEach((ual) => {
            finalResult.local.push(ual);
            delete tokenIds[ual];
        });

        if (ualNotPresentLocally.length === 0) {
            await this.operationService.markOperationAsCompleted(
                operationId,
                blockchain,
                finalResult,
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

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_FIND_SHARD_START,
        );

        let nodesInfo = [];
        // if (paranetNodesAccessPolicy === PARANET_ACCESS_POLICY.PERMISSIONED) {
        //     const onChainNodes = await this.blockchainModuleManager.getPermissionedNodes(
        //         blockchain,
        //         paranetId,
        //     );
        //     const foundNodes = await Promise.all(
        //         onChainNodes.map(async (node) =>
        //             this.shardingTableService.findPeerAddressAndProtocols(
        //                 this.cryptoService.convertHexToAscii(node.nodeId),
        //             ),
        //         ),
        //     );
        //     const networkProtocols = this.operationService.getNetworkProtocols();

        //     for (const node of foundNodes) {
        //         if (node.id !== currentPeerId) {
        //             nodesInfo.push({ id: node.id, protocol: networkProtocols[0] });
        //         }
        //     }
        // } else {
        nodesInfo = await this.findShardNodes(operationId, blockchain, currentPeerId);
        // Make order of nodes random, shuffle the array
        nodesInfo = nodesInfo.sort(() => Math.random() - 0.5);
        // }

        if (nodesInfo.length < 1) {
            await this.handleError(
                operationId,
                blockchain,
                `Unable to find enough nodes for operationId: ${operationId}. Minimum number of nodes required: 1`,
                ERROR_TYPE.FIND_SHARD.BATCH_GET_FIND_SHARD_ERROR,
                true,
            );
            return Command.empty();
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_FIND_SHARD_END,
        );

        let index = 0;
        let commandCompleted = false;

        while (index < nodesInfo.length && ualNotPresentLocally.length > 0 && !commandCompleted) {
            const batch = nodesInfo.slice(index, index + BATCH_SIZE);
            const message = {
                blockchain,
                tokenIds,
                includeMetadata,
                uals: ualNotPresentLocally,
                repository,
            };

            // eslint-disable-next-line no-loop-func
            const messagePromises = batch.map((node) =>
                this.sendMessage(node, operationId, message)
                    .then(async (result) => {
                        if (commandCompleted || !result.success) {
                            return;
                        }

                        const validationResult = await this.validateBatchResponse(
                            result.responseData.assertions,
                            blockchain,
                            paranetNodesAccessPolicy,
                            contentType,
                            finalResult,
                        );

                        for (const [ual, isKCValid] of Object.entries(validationResult)) {
                            if (isKCValid) {
                                finalResult.remote[ual] = result.responseData.assertions[ual];
                                finalResult.metadata[ual] = result.responseData.metadata[ual];
                                const idx = ualNotPresentLocally.indexOf(ual);
                                if (idx !== -1) {
                                    ualNotPresentLocally.splice(idx, 1);
                                }
                            }
                        }

                        if (ualNotPresentLocally.length === 0 && !commandCompleted) {
                            commandCompleted = true;
                            await this.operationService.markOperationAsCompleted(
                                operationId,
                                blockchain,
                                finalResult,
                                [
                                    OPERATION_ID_STATUS.GET.GET_LOCAL_END,
                                    OPERATION_ID_STATUS.GET.GET_END,
                                    OPERATION_ID_STATUS.COMPLETED,
                                ],
                            );
                        }
                    })
                    .catch((err) => {
                        this.logger.warn(`Node ${node.id} failed: ${err.message}`);
                    }),
            );

            // eslint-disable-next-line no-await-in-loop, no-loop-func
            await new Promise((resolve) => {
                let settled = 0;
                // eslint-disable-next-line no-loop-func
                messagePromises.forEach((p) =>
                    p.finally(() => {
                        settled += 1;
                        if (commandCompleted || settled === promises.length) {
                            resolve();
                        }
                    }),
                );
            });

            index += BATCH_SIZE;
        }

        // Just in case we finish outside early-exit
        if (!commandCompleted) {
            await this.operationService.markOperationAsCompleted(
                operationId,
                blockchain,
                finalResult,
                [
                    OPERATION_ID_STATUS.GET.GET_LOCAL_END,
                    OPERATION_ID_STATUS.GET.GET_END,
                    OPERATION_ID_STATUS.COMPLETED,
                ],
            );
        }
        return Command.empty();
    }

    async validateUALs(operationId, blockchain, uals) {
        if (uals.length === 0) {
            return {
                isValid: false,
                errorMessage: `Get for operation id: ${operationId}, UALs: ${uals}: no UALs provided.`,
            };
        }

        const validationPromises = uals.map(async (ual) => {
            const isUAL = this.ualService.isUAL(ual);
            if (!isUAL) {
                return {
                    isValid: false,
                    errorMessage: `Get for operation id: ${operationId}, UAL: ${ual}: is not a UAL.`,
                };
            }

            const { contract, knowledgeCollectionId } = this.ualService.resolveUAL(ual);

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
        });

        const results = await Promise.all(validationPromises);

        // Find the first invalid result if any
        const invalidResult = results.find((result) => !result.isValid);
        if (invalidResult) {
            return invalidResult;
        }

        return {
            isValid: true,
            errorMessage: null,
        };
    }

    // async validateParanet(
    //     operationId,
    //     paranetUAL,
    //     paranetBlockchain,
    //     paranetKnowledgeAssetId,
    //     paranetNodeAccessPolicy,
    //     paranetId,
    //     blockchain,
    //     uals,
    // ) {
    //     if (!paranetKnowledgeAssetId) {
    //         return {
    //             isValid: false,
    //             errorMessage: `Invalid paranet UAL: ${paranetUAL} . Paranet knowledge asset token id is required!`,
    //         };
    //     }
    //     const isParanetUAL = this.ualService.isUAL(paranetUAL);

    //     if (!isParanetUAL) {
    //         return {
    //             isValid: false,
    //             errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: is not a UAL.`,
    //         };
    //     }

    //     const [paranetExists, chainParanetNodesAccessPolicy] = await Promise.all([
    //         this.blockchainModuleManager.paranetExists(paranetBlockchain, paranetId),
    //         this.blockchainModuleManager.getNodesAccessPolicy(paranetBlockchain, paranetId),
    //     ]);

    //     if (!paranetExists) {
    //         return {
    //             isValid: false,
    //             errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: paranet does not exist.`,
    //         };
    //     }

    //     if (paranetNodeAccessPolicy !== chainParanetNodesAccessPolicy) {
    //         return {
    //             isValid: false,
    //             errorMessage: `Get for operation id: ${operationId}, Paranet UAL: ${paranetUAL}: onchain paranet access policy does not match the requested paranet access policy.`,
    //         };
    //     }

    //     const validationPromises = uals.map(async (ual) => {
    //         const { contract, knowledgeCollectionId } = this.ualService.resolveUAL(ual);
    //         const knowledgeCollectionOnchainId = this.cryptoService.keccak256EncodePacked(
    //             ['address', 'uint256'],
    //             [contract, knowledgeCollectionId],
    //         );
    //         const paranetContainsKnowledgeCollection =
    //             await this.blockchainModuleManager.isKnowledgeCollectionRegistered(
    //                 blockchain,
    //                 paranetId,
    //                 knowledgeCollectionOnchainId,
    //             );
    //         if (!paranetContainsKnowledgeCollection) {
    //             return {
    //                 isValid: false,
    //                 errorMessage: `Paranet UAL: ${paranetUAL} does not contain Knowledge Collection: ${ual}`,
    //             };
    //         }
    //         return {
    //             isValid: true,
    //             errorMessage: null,
    //         };
    //     });

    //     const results = await Promise.all(validationPromises);

    //     // Find the first invalid result if any
    //     const invalidResult = results.find((result) => !result.isValid);
    //     if (invalidResult) {
    //         return invalidResult;
    //     }

    //     return {
    //         isValid: true,
    //         errorMessage: null,
    //     };
    // }

    async findShardNodes(operationId, blockchain, currentPeerId) {
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
            NETWORK_MESSAGE_TIMEOUT_MILLS.BATCH_GET.REQUEST,
        );
        return {
            success: response.header.messageType === NETWORK_MESSAGE_TYPES.RESPONSES.ACK,
            responseData: response.data,
        };
    }

    async validateBatchResponse(
        responseData,
        blockchain,
        paranetNodesAccessPolicy,
        contentType,
        finalResult,
    ) {
        const validationResults = {};
        await Promise.all(
            Object.entries(responseData).map(async ([ual, assertion]) => {
                // Already received and validate this assertion
                if (finalResult.remote[ual]) {
                    return;
                }
                if (contentType === 'private') {
                    validationResults[ual] = true;
                    return;
                }
                const filteredPublic = [];
                const privateHashTriples = [];

                // Separate public vs private hash triples
                if (!assertion.public || assertion.public.length === 0) {
                    validationResults[ual] = false;
                    return;
                }
                assertion.public.forEach((triple) => {
                    if (triple.startsWith(`<${PRIVATE_HASH_SUBJECT_PREFIX}`)) {
                        privateHashTriples.push(triple);
                    } else {
                        filteredPublic.push(triple);
                    }
                });

                // Group triples by subject
                const publicKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
                    filteredPublic,
                    true,
                );
                publicKnowledgeAssetsTriplesGrouped.push(
                    ...kcTools.groupNquadsBySubject(privateHashTriples, true),
                );

                try {
                    // Validate public dataset
                    const { contract, knowledgeCollectionId } = this.ualService.resolveUAL(ual);
                    await this.validationService.validateDatasetOnBlockchain(
                        publicKnowledgeAssetsTriplesGrouped.map((t) => t.sort()).flat(),
                        blockchain,
                        contract,
                        knowledgeCollectionId,
                    );

                    // If not permissioned and there are private triples, validate
                    if (assertion?.private?.length) {
                        await this.validationService.validatePrivateMerkleRoot(
                            assertion.public,
                            assertion.private,
                        );
                    }
                    validationResults[ual] = true;
                } catch (e) {
                    this.logger.error(`Validation failed for UAL ${ual}: ${e.name}, ${e.message}`);
                    validationResults[ual] = false;
                }
            }),
        );

        return validationResults;
    }

    /**
     * Builds default GetCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'batchGetCommand',
            delay: 0,
            transactional: false,
            priority: COMMAND_PRIORITY.MEDIUM,
        };
        Object.assign(command, map);
        return command;
    }
}

export default BatchGetCommand;
