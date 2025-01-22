/* eslint-disable no-await-in-loop */
import { setTimeout } from 'timers/promises';
import Command from '../command.js';
import {
    ERROR_TYPE,
    PARANET_SYNC_FREQUENCY_MILLS,
    OPERATION_ID_STATUS,
    PARANET_SYNC_PARAMETERS,
    PARANET_SYNC_KA_COUNT,
    PARANET_SYNC_RETRIES_LIMIT,
    PARANET_SYNC_RETRY_DELAY_MS,
    OPERATION_STATUS,
    PARANET_NODES_ACCESS_POLICIES,
} from '../../constants/constants.js';

class ParanetSyncCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.tripleStoreService = ctx.tripleStoreService;
        this.ualService = ctx.ualService;
        this.paranetService = ctx.paranetService;
        this.getService = ctx.getService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;

        this.errorType = ERROR_TYPE.PARANET.PARANET_SYNC_ERROR;
    }

    // TODO: Fix logs? Use word 'Knowledge Collection' or 'Collection' instead of 'Asset'.
    async execute(command) {
        const { blockchain, operationId, paranetUAL, paranetId, paranetMetadata } = command.data;

        const paranetNodesAccessPolicy =
            PARANET_NODES_ACCESS_POLICIES[paranetMetadata.nodesAccessPolicy];

        this.logger.info(
            `Paranet sync: Starting paranet sync for paranet: ${paranetUAL} (${paranetId}), operation ID: ${operationId}, access policy ${paranetNodesAccessPolicy}`,
        );

        const countContract = (
            await this.blockchainModuleManager.getParanetKnowledgeCollectionCount(
                blockchain,
                paranetId,
            )
        ).toNumber();
        const countDatabase = await this.repositoryModuleManager.getParanetKcCount(paranetUAL);

        const missingUALs = (
            await this.blockchainModuleManager.getParanetKnowledgeCollectionLocatorsWithPagination(
                blockchain,
                paranetId,
                countDatabase,
                countContract,
            )
        ).map(({ knowledgeCollectionStorageContract, knowledgeCollectionTokenId }) =>
            this.ualService.deriveUAL(
                blockchain,
                knowledgeCollectionStorageContract,
                knowledgeCollectionTokenId,
            ),
        );

        await this.repositoryModuleManager.createParanetKcRecords(
            paranetUAL,
            blockchain,
            missingUALs,
        );

        const countSynced = await this.repositoryModuleManager.getParanetKcSyncedCount(paranetUAL);
        const countUnsynced = await this.repositoryModuleManager.getParanetKcUnsyncedCount(
            paranetUAL,
        );

        this.logger.info(
            `Paranet sync: Paranet: ${paranetUAL} (${paranetId}) Total count of Paranet KAs in the contract: ${countContract}; Synced KAs count: ${countSynced};  Total count of missed KAs: ${countUnsynced}`,
        );

        if (countUnsynced === 0) {
            this.logger.info(
                `Paranet sync: No new assets to sync for paranet: ${paranetUAL} (${paranetId}), operation ID: ${operationId}!`,
            );
            return Command.repeat();
        }
        // #region Sync batch;
        const syncBatch = await this.repositoryModuleManager.getParanetKcSyncBatch(
            paranetUAL,
            PARANET_SYNC_RETRIES_LIMIT,
            PARANET_SYNC_RETRY_DELAY_MS,
            PARANET_SYNC_KA_COUNT,
        );

        this.logger.info(
            `Paranet sync: Attempting to sync ${syncBatch.length} missed assets for paranet: ${paranetUAL} (${paranetId}), operation ID: ${operationId}!`,
        );

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.PARANET.PARANET_SYNC_MISSED_KAS_SYNC_START,
        );

        const syncResults = await Promise.all(
            syncBatch.map(({ ual }) =>
                this.syncKc(paranetUAL, ual, paranetId, paranetNodesAccessPolicy, operationId),
            ),
        );

        const countSyncSuccessful = syncResults.filter((err) => !err).length;
        const countSyncFailed = syncResults.length - countSyncSuccessful;

        this.logger.info(
            `Paranet sync: Successful missed assets syncs: ${countSyncSuccessful}; ` +
                `Failed missed assets syncs: ${countSyncFailed}  for paranet: ${paranetUAL} ` +
                `(${paranetId}), operation ID: ${operationId}!`,
        );
        // #endregion

        await this.operationIdService.updateOperationIdStatusWithValues(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.PARANET.PARANET_SYNC_MISSED_KAS_SYNC_END,
            countSyncSuccessful,
            countSyncFailed,
        );

        return Command.repeat();
    }

    /** **NOTE:** Throws errors! */
    async syncKcState(
        paranetUAL,
        ual,
        stateIndex,
        assertionId,
        paranetId,
        paranetNodesAccessPolicy,
    ) {
        const { blockchain, contract, knowledgeCollectionId } = this.ualService.resolveUAL(ual);

        const getOperationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.GET.GET_START,
        );

        // #region GET (LOCAL)
        this.operationIdService.updateOperationIdStatus(
            getOperationId,
            blockchain,
            OPERATION_ID_STATUS.GET.GET_INIT_START,
        );
        this.repositoryModuleManager.createOperationRecord(
            this.getService.getOperationName(),
            getOperationId,
            OPERATION_STATUS.IN_PROGRESS,
        );
        this.logger.debug(
            `Paranet sync: Get for ${ual} with operation id ${getOperationId} initiated.`,
        );

        const maxAttempts = PARANET_SYNC_PARAMETERS.GET_RESULT_POLLING_MAX_ATTEMPTS;
        const pollingInterval = PARANET_SYNC_PARAMETERS.GET_RESULT_POLLING_INTERVAL_MILLIS;

        let attempt = 0;
        let getResult;

        await this.commandExecutor.add({
            name: 'getFindShardCommand',
            sequence: [],
            delay: 0,
            data: {
                operationId: getOperationId,
                id: ual,
                blockchain,
                contract,
                knowledgeCollectionId,
                state: assertionId,
                paranetId,
                paranetUAL,
                paranetNodesAccessPolicy,
                paranetSync: true,
            },
            transactional: false,
        });

        attempt = 0;
        do {
            await setTimeout(pollingInterval);
            getResult = await this.operationIdService.getOperationIdRecord(getOperationId);
            attempt += 1;
        } while (
            attempt < maxAttempts &&
            getResult?.status !== OPERATION_ID_STATUS.FAILED &&
            getResult?.status !== OPERATION_ID_STATUS.COMPLETED
        );
        // #endregion NETWORK END

        if (getResult?.status !== OPERATION_ID_STATUS.COMPLETED) {
            throw new Error(
                `Unable to sync Knowledge Collection Id: ${knowledgeCollectionId}, for contract: ${contract}, state index: ${stateIndex}, blockchain: ${blockchain}, GET result: ${JSON.stringify(
                    getResult,
                )}`,
            );
        }

        const data = await this.operationIdService.getCachedOperationIdData(getOperationId);
        this.logger.debug(
            `Paranet sync: ${
                data.assertion.public.length + (data.assertion?.private?.length || 0)
            } nquads found for asset with ual: ${ual}, state index: ${stateIndex}, assertionId: ${assertionId}`,
        );

        const paranetRepository = this.paranetService.getParanetRepositoryName(paranetUAL);
        await this.tripleStoreService.insertKnowledgeCollection(
            paranetRepository,
            ual,
            data.assertion,
        );
        // TODO: Curated paranets, paranetNodesAccessPolicy

        /*
            this doesnt work for v8
            await this.tripleStoreService.localStoreAsset(
                repository,
                assertionId,
                data.assertion,
                blockchain,
                contract,
                tokenId,
                LOCAL_INSERT_FOR_CURATED_PARANET_MAX_ATTEMPTS,
                LOCAL_INSERT_FOR_CURATED_PARANET_RETRY_DELAY,
            );
            if (paranetNodesAccessPolicy === 'CURATED' && data.privateAssertion) {
                await this.tripleStoreService.localStoreAsset(
                    repository,
                    data.syncedAssetRecord.privateAssertionId,
                    data.privateAssertion,
                    blockchain,
                    contract,
                    tokenId,
                );
            }
            const privateAssertionId =
                paranetNodesAccessPolicy === 'CURATED'
                    ? data.syncedAssetRecord?.privateAssertionId
                    : null;
            */
    }

    /**
     * Syncs all states ("merkle roots") of a Knowledge Collection in a paranet.
     *
     * @param {string} paranetUAL Universal Asset Locator of the paranet
     * @param {string} ual Universal Asset Locator of the Knowledge Collection
     * @param {string} paranetId Id of paranet, stored on-chain. Provided in command options.
     * @param {'OPEN'|'CURATED'} paranetNodesAccessPolicy Node access policy, enum string indicating paranet type.
     * @param {string} operationId Local database id of sync operation. Needed for logging.
     *
     * @returns {Promise<null|Error>} Returns `null` if sync of all states was successful, otherwise `Error` which broke the operation.
     */
    async syncKc(paranetUAL, ual, paranetId, paranetNodesAccessPolicy, operationId) {
        try {
            this.logger.info(
                `Paranet sync: Syncing asset: ${ual} for paranet: ${paranetId}, operation ID: ${operationId}`,
            );

            const { blockchain, contract, knowledgeCollectionId } = this.ualService.resolveUAL(ual);
            const merkleRoots =
                await this.blockchainModuleManager.getKnowledgeCollectionMerkleRoots(
                    blockchain,
                    contract,
                    knowledgeCollectionId,
                );

            for (let stateIndex = 0; stateIndex < merkleRoots.length; stateIndex += 1) {
                this.logger.debug(
                    `Paranet sync: Fetching state: ${merkleRoots[stateIndex].merkleRoot} index: ${
                        stateIndex + 1
                    } of ${merkleRoots.length} for asset with ual: ${ual}.`,
                );

                await this.syncKcState(
                    paranetUAL,
                    ual,
                    stateIndex,
                    merkleRoots[stateIndex].merkleRoot,
                    paranetId,
                    paranetNodesAccessPolicy,
                );
            }

            await this.repositoryModuleManager.paranetKcMarkAsSynced(paranetUAL, ual);
            return null;
        } catch (error) {
            this.logger.warn(
                `Paranet sync: Failed to sync asset: ${ual} for paranet: ${paranetId}, error: ${error}`,
            );

            await this.repositoryModuleManager.paranetKcIncrementRetries(
                paranetUAL,
                ual,
                `${error}`,
            );
            return error;
        }
    }

    /**
     * Recover system from failure
     * @param command
     * @param error
     */
    async recover(command) {
        this.logger.warn(`Failed to execute ${command.name}. Error: ${command.message}`);

        return Command.repeat();
    }

    /**
     * Builds default paranetSyncCommands
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'paranetSyncCommands',
            data: {},
            transactional: false,
            period: PARANET_SYNC_FREQUENCY_MILLS,
        };
        Object.assign(command, map);
        return command;
    }
}

export default ParanetSyncCommand;
