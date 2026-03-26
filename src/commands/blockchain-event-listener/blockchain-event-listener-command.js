import Command from '../command.js';
import {
    CONTRACTS,
    MONITORED_CONTRACT_EVENTS,
    CONTRACT_INDEPENDENT_EVENTS,
    ERROR_TYPE,
    OPERATION_ID_STATUS,
    MONITORED_CONTRACTS,
    MONITORED_EVENTS,
    COMMAND_PRIORITY,
} from '../../constants/constants.js';

class BlockchainEventListenerCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.ualService = ctx.ualService;
        this.blockchainEventsService = ctx.blockchainEventsService;
        this.fileService = ctx.fileService;
        this.operationIdService = ctx.operationIdService;
        this.commandExecutor = ctx.commandExecutor;

        this.invalidatedContracts = new Set();

        this.errorType = ERROR_TYPE.BLOCKCHAIN_EVENT_LISTENER_ERROR;
    }

    async execute(command) {
        const { blockchainId } = command.data;

        const repositoryTransaction = await this.repositoryModuleManager.transaction();

        try {
            await this.fetchAndHandleBlockchainEvents(blockchainId, repositoryTransaction);
            await repositoryTransaction.commit();
        } catch (e) {
            this.logger.error(
                `Failed to fetch and process blockchain events for blockchain: ${blockchainId}. Error: ${e}`,
            );
            await repositoryTransaction.rollback();

            return Command.repeat();
        }

        await this.repositoryModuleManager.markAllBlockchainEventsAsProcessed(blockchainId);

        return Command.empty();
    }

    async fetchAndHandleBlockchainEvents(blockchainId, repositoryTransaction) {
        const currentBlock = (await this.blockchainEventsService.getBlock(blockchainId)).number - 2;
        const lastCheckedBlockRecord = await this.repositoryModuleManager.getLastCheckedBlock(
            blockchainId,
            { transaction: repositoryTransaction },
        );

        const { events: newEvents, eventsMissed } =
            await this.blockchainEventsService.getPastEvents(
                blockchainId,
                MONITORED_CONTRACTS,
                MONITORED_EVENTS,
                lastCheckedBlockRecord?.lastCheckedBlock ?? 0,
                currentBlock,
            );

        if (eventsMissed) {
            const missedFrom = (lastCheckedBlockRecord?.lastCheckedBlock ?? 0) + 1;
            this.logger.warn(
                `[EVENT LISTENER] Blockchain events missed on ${blockchainId}! ` +
                    `Gap too large: blocks ${missedFrom}–${currentBlock} ` +
                    `(${currentBlock - missedFrom + 1} blocks). ` +
                    `Publish finality for assets created during this window will not complete.`,
            );
        }

        if (newEvents.length !== 0) {
            this.logger.trace(
                `Storing ${newEvents.length} new events for blockchain ${blockchainId} in the database.`,
            );
            await this.repositoryModuleManager.insertBlockchainEvents(newEvents, {
                transaction: repositoryTransaction,
            });
        }

        await this.repositoryModuleManager.updateLastCheckedBlock(
            blockchainId,
            currentBlock,
            Date.now(),
            { transaction: repositoryTransaction },
        );

        const unprocessedEvents =
            await this.repositoryModuleManager.getAllUnprocessedBlockchainEvents(
                blockchainId,
                MONITORED_EVENTS,
                { transaction: repositoryTransaction },
            );

        if (unprocessedEvents.length > 0) {
            this.logger.trace(
                `Handling ${unprocessedEvents.length} unprocessed blockchain events.`,
            );
        }

        this.independentEvents = [];
        this.dependentEvents = [];
        for (const event of unprocessedEvents) {
            if (this.isIndependentEvent(event.contract, event.event)) {
                this.independentEvents.push(event);
            } else {
                this.dependentEvents.push(event);
            }
        }

        this.dependentEvents.sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) {
                return a.blockNumber - b.blockNumber;
            }
            if (a.transactionIndex !== b.transactionIndex) {
                return a.transactionIndex - b.transactionIndex;
            }
            return a.logIndex - b.logIndex;
        });

        await Promise.all([
            this.processIndependentEvents(currentBlock, repositoryTransaction),
            this.processDependentEvents(currentBlock, repositoryTransaction),
        ]);
    }

    isIndependentEvent(contractName, eventName) {
        const contractIndependentEvents = CONTRACT_INDEPENDENT_EVENTS[contractName] || [];
        return contractIndependentEvents.includes(eventName);
    }

    async processIndependentEvents(currentBlock, repositoryTransaction) {
        await Promise.all(
            this.independentEvents.map((event) =>
                this.processEvent(event, currentBlock, repositoryTransaction),
            ),
        );
    }

    async processDependentEvents(currentBlock, repositoryTransaction) {
        let index = 0;

        while (index < this.dependentEvents.length) {
            const event = this.dependentEvents[index];

            // Step 1: Handle invalidated contracts
            if (this.invalidatedContracts.has(event.contractAddress)) {
                this.logger.info(
                    `Skipping event ${event.event} for blockchain: ${event.blockchain}, ` +
                        `invalidated contract: ${event.contract} (${event.contractAddress})`,
                );

                this.dependentEvents.splice(index, 1); // Remove the invalidated event
                continue; // Restart the loop with the updated array
            }

            // Step 2: Handle new dependent events
            if (this.newDependentEvents?.length > 0) {
                this.logger.info(
                    `Adding ${this.newDependentEvents.length} new dependent events before processing.`,
                );

                // Merge new events into the unprocessed part of the array
                const combinedEvents = [
                    ...this.dependentEvents.slice(index), // Unprocessed events
                    ...this.newDependentEvents, // New events
                ].sort((a, b) => {
                    if (a.blockNumber !== b.blockNumber) {
                        return a.blockNumber - b.blockNumber;
                    }
                    if (a.transactionIndex !== b.transactionIndex) {
                        return a.transactionIndex - b.transactionIndex;
                    }
                    return a.logIndex - b.logIndex;
                });

                // Update dependentEvents: add back processed events + sorted combined events
                this.dependentEvents = [...this.dependentEvents.slice(0, index), ...combinedEvents];

                // Reset the new events buffer
                this.newDependentEvents = [];
            }

            // Step 3: Process the current event
            // eslint-disable-next-line no-await-in-loop
            await this.processEvent(event, currentBlock, repositoryTransaction);

            index += 1; // Move to the next event
        }

        // Clear invalidated contracts after processing
        this.invalidatedContracts.clear();
    }

    async processEvent(event, currentBlock, repositoryTransaction) {
        const handlerFunctionName = `handle${event.event}Event`;

        if (typeof this[handlerFunctionName] !== 'function') {
            this.logger.warn(`No handler for event type: ${event.event}`);
            return;
        }

        this.logger.trace(`Processing event ${event.event} in block ${event.blockNumber}.`);
        try {
            await this[handlerFunctionName](event, currentBlock, repositoryTransaction);
        } catch (error) {
            this.logger.error(
                `Error processing event ${event.event} in block ${event.blockNumber}: ${error.message}`,
            );
        }
    }

    async handleParameterChangedEvent(event) {
        const { blockchain, contract, data } = event;
        const { parameterName, parameterValue } = JSON.parse(data);
        switch (contract) {
            case CONTRACTS.PARAMETERS_STORAGE:
                this.blockchainModuleManager.setContractCallCache(
                    blockchain,
                    CONTRACTS.PARAMETERS_STORAGE,
                    parameterName,
                    parameterValue,
                );
                break;
            default:
                this.logger.warn(
                    `Unable to handle parameter changed event. Unknown contract name ${event.contract}`,
                );
        }
    }

    async handleNewContractEvent(event, currentBlock, repositoryTransaction) {
        const { contractName, newContractAddress } = JSON.parse(event.data);

        const blockchchainModuleContractAddress = this.blockchainModuleManager.getContractAddress(
            event.blockchain,
            contractName,
        );

        if (newContractAddress !== blockchchainModuleContractAddress) {
            this.blockchainModuleManager.initializeContract(
                event.blockchain,
                contractName,
                newContractAddress,
            );
        }

        const blockchainEventsServiceContractAddress =
            this.blockchainEventsService.getContractAddress(event.blockchain, contractName);

        if (
            blockchainEventsServiceContractAddress &&
            newContractAddress !== blockchainEventsServiceContractAddress
        ) {
            this.blockchainEventsService.updateContractAddress(
                event.blockchain,
                contractName,
                newContractAddress,
            );

            this.invalidatedContracts.add(blockchainEventsServiceContractAddress);

            await this.repositoryModuleManager.removeContractEventsAfterBlock(
                event.blockchain,
                contractName,
                event.contractAddress,
                event.blockNumber,
                event.transactionIndex,
                { transaction: repositoryTransaction },
            );

            const { events: newEvents } = await this.blockchainEventsService.getPastEvents(
                event.blockchain,
                [contractName],
                MONITORED_CONTRACT_EVENTS[contractName],
                event.blockNumber,
                currentBlock,
            );

            if (newEvents.length !== 0) {
                this.logger.trace(
                    `Storing ${newEvents.length} new events for blockchain ${event.blockchain} in the database.`,
                );
                await this.repositoryModuleManager.insertBlockchainEvents(newEvents, {
                    transaction: repositoryTransaction,
                });

                this.newDependentEvents = newEvents;
            }
        }
    }

    async handleContractChangedEvent(event, currentBlock, repositoryTransaction) {
        const { contractName, newContractAddress } = JSON.parse(event.data);

        const blockchchainModuleContractAddress = this.blockchainModuleManager.getContractAddress(
            event.blockchain,
            contractName,
        );

        if (newContractAddress !== blockchchainModuleContractAddress) {
            this.blockchainModuleManager.initializeContract(
                event.blockchain,
                contractName,
                newContractAddress,
            );
        }

        const blockchainEventsServiceContractAddress =
            this.blockchainEventsService.getContractAddress(event.blockchain, contractName);

        if (
            blockchainEventsServiceContractAddress &&
            newContractAddress !== blockchainEventsServiceContractAddress
        ) {
            this.blockchainEventsService.updateContractAddress(
                event.blockchain,
                contractName,
                newContractAddress,
            );

            this.invalidatedContracts.add(blockchainEventsServiceContractAddress);

            await this.repositoryModuleManager.removeContractEventsAfterBlock(
                event.blockchain,
                contractName,
                event.contractAddress,
                event.blockNumber,
                event.transactionIndex,
                { transaction: repositoryTransaction },
            );

            const { events: newEvents } = await this.blockchainEventsService.getPastEvents(
                event.blockchain,
                [contractName],
                MONITORED_CONTRACT_EVENTS[contractName],
                event.blockNumber,
                currentBlock,
            );

            if (newEvents.length !== 0) {
                this.logger.trace(
                    `Storing ${newEvents.length} new events for blockchain ${event.blockchain} in the database.`,
                );
                await this.repositoryModuleManager.insertBlockchainEvents(newEvents, {
                    transaction: repositoryTransaction,
                });

                this.newDependentEvents = newEvents;
            }
        }
    }

    async handleNewAssetStorageEvent(event, currentBlock, repositoryTransaction) {
        const { contractName, newContractAddress } = JSON.parse(event.data);

        const blockchchainModuleContractAddress = this.blockchainModuleManager.getContractAddress(
            event.blockchain,
            contractName,
        );

        if (newContractAddress !== blockchchainModuleContractAddress) {
            this.blockchainModuleManager.initializeAssetStorageContract(
                event.blockchain,
                newContractAddress,
            );
        }

        const blockchainEventsServiceContractAddress =
            this.blockchainEventsService.getContractAddress(event.blockchain, contractName);

        if (
            blockchainEventsServiceContractAddress &&
            newContractAddress !== blockchainEventsServiceContractAddress
        ) {
            this.blockchainEventsService.updateContractAddress(
                event.blockchain,
                contractName,
                newContractAddress,
            );

            this.invalidatedContracts.add(blockchainEventsServiceContractAddress);

            await this.repositoryModuleManager.removeContractEventsAfterBlock(
                event.blockchain,
                contractName,
                event.contractAddress,
                event.blockNumber,
                event.transactionIndex,
                { transaction: repositoryTransaction },
            );

            const { events: newEvents } = await this.blockchainEventsService.getPastEvents(
                event.blockchain,
                [contractName],
                MONITORED_CONTRACT_EVENTS[contractName],
                event.blockNumber,
                currentBlock,
            );

            if (newEvents.length !== 0) {
                this.logger.trace(
                    `Storing ${newEvents.length} new events for blockchain ${event.blockchain} in the database.`,
                );
                await this.repositoryModuleManager.insertBlockchainEvents(newEvents, {
                    transaction: repositoryTransaction,
                });

                this.newDependentEvents = newEvents;
            }
        }
    }

    async handleAssetStorageChangedEvent(event, currentBlock, repositoryTransaction) {
        const { contractName, newContractAddress } = JSON.parse(event.data);

        const blockchchainModuleContractAddress = this.blockchainModuleManager.getContractAddress(
            event.blockchain,
            contractName,
        );

        if (newContractAddress !== blockchchainModuleContractAddress) {
            this.blockchainModuleManager.initializeAssetStorageContract(
                event.blockchain,
                newContractAddress,
            );
        }

        const blockchainEventsServiceContractAddress =
            this.blockchainEventsService.getContractAddress(event.blockchain, contractName);

        if (
            blockchainEventsServiceContractAddress &&
            newContractAddress !== blockchainEventsServiceContractAddress
        ) {
            this.blockchainEventsService.updateContractAddress(
                event.blockchain,
                contractName,
                newContractAddress,
            );

            this.invalidatedContracts.add(blockchainEventsServiceContractAddress);

            await this.repositoryModuleManager.removeContractEventsAfterBlock(
                event.blockchain,
                contractName,
                event.contractAddress,
                event.blockNumber,
                event.transactionIndex,
                { transaction: repositoryTransaction },
            );

            const { events: newEvents } = await this.blockchainEventsService.getPastEvents(
                event.blockchain,
                [contractName],
                MONITORED_CONTRACT_EVENTS[contractName],
                event.blockNumber,
                currentBlock,
            );

            if (newEvents.length !== 0) {
                this.logger.trace(
                    `Storing ${newEvents.length} new events for blockchain ${event.blockchain} in the database.`,
                );
                await this.repositoryModuleManager.insertBlockchainEvents(newEvents, {
                    transaction: repositoryTransaction,
                });

                this.newDependentEvents = newEvents;
            }
        }
    }

    async handleKnowledgeCollectionCreatedEvent(event) {
        await this.commandExecutor.add({
            name: 'publishFinalizationCommand',
            sequence: [],
            data: {
                event,
            },
            priority: COMMAND_PRIORITY.HIGHEST,
            transactional: false,
        });
    }

    // TODO: Adjust after new contracts are released
    async handleAssetUpdatedEvent(event) {
        const eventData = JSON.parse(event.data);

        // TODO: Add correct name for assetStateIndex from event currently it's placeholder
        const { assetContract, tokenId, state, updateOperationId, assetStateIndex } = eventData;
        const { blockchain } = event;

        const operationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.UPDATE_FINALIZATION.UPDATE_FINALIZATION_START,
            blockchain,
        );

        let datasetPath;
        let cachedData;
        try {
            datasetPath = this.fileService.getPendingStorageDocumentPath(updateOperationId);
            cachedData = await this.fileService.readFile(datasetPath, true);
        } catch (error) {
            this.operationIdService.markOperationAsFailed(
                operationId,
                blockchain,
                `Unable to read cached data from ${datasetPath}, error: ${error.message}`,
                ERROR_TYPE.PUBLISH_FINALIZATION.PUBLISH_FINALIZATION_NO_CACHED_DATA,
            );
        }
        const ual = this.ualService.deriveUAL(blockchain, assetContract, tokenId);

        await this.commandExecutor.add({
            name: 'updateValidateAssertionMetadataCommand',
            sequence: ['updateAssertionCommand'],
            delay: 0,
            data: {
                operationId,
                ual,
                blockchain,
                contract: assetContract,
                tokenId,
                assetStateIndex,
                merkleRoot: state,
                assertion: cachedData.assertion,
                cachedMerkleRoot: cachedData.merkleRoot,
            },
            transactional: false,
        });
    }

    /**
     * Recover system from failure
     * @param error
     */
    async recover() {
        return Command.repeat();
    }

    /**
     * Builds default BlockchainEventListenerCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'blockchainEventListenerCommand',
            data: {},
            transactional: false,
            priority: COMMAND_PRIORITY.HIGHEST,
        };
        Object.assign(command, map);
        return command;
    }
}

export default BlockchainEventListenerCommand;
