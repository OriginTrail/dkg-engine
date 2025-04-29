import Sequelize from 'sequelize';

class BlockchainEventRepository {
    constructor(models) {
        this.sequelize = models.sequelize;
        this.model = models.blockchain_event;
    }

    async insertBlockchainEvents(events, options) {
        const chunkSize = 10000;
        let insertedEvents = [];

        for (let i = 0; i < events.length; i += chunkSize) {
            const chunk = events.slice(i, i + chunkSize);
            // eslint-disable-next-line no-await-in-loop
            const insertedChunk = await this.model.bulkCreate(
                chunk.map((event) => ({
                    blockchain: event.blockchain,
                    contract: event.contract,
                    contractAddress: event.contractAddress,
                    event: event.event,
                    data: event.data,
                    blockNumber: event.blockNumber,
                    transactionIndex: event.transactionIndex,
                    logIndex: event.logIndex,
                    processed: false,
                })),
                {
                    ignoreDuplicates: true,
                    ...options,
                },
            );

            insertedEvents = insertedEvents.concat(insertedChunk.map((event) => event.dataValues));
        }

        return insertedEvents;
    }

    async getAllUnprocessedBlockchainEvents(blockchain, eventNames, options) {
        return this.model.findAll({
            where: {
                blockchain,
                processed: false,
                event: { [Sequelize.Op.in]: eventNames },
            },
            order: [
                ['blockNumber', 'asc'],
                ['transactionIndex', 'asc'],
                ['logIndex', 'asc'],
            ],
            ...options,
        });
    }

    async markAllBlockchainEventsAsProcessed(blockchain, options) {
        return this.model.update(
            { processed: true },
            {
                where: { blockchain },
                ...options,
            },
        );
    }

    async removeEvents(ids, options) {
        await this.model.destroy({
            where: {
                id: { [Sequelize.Op.in]: ids },
            },
            ...options,
        });
    }

    async removeContractEventsAfterBlock(
        blockchain,
        contract,
        contractAddress,
        blockNumber,
        transactionIndex,
        options,
    ) {
        return this.model.destroy({
            where: {
                blockchain,
                contract,
                contractAddress,
                [Sequelize.Op.or]: [
                    // Events in blocks after the given blockNumber
                    { blockNumber: { [Sequelize.Op.gt]: blockNumber } },
                    // Events in the same blockNumber but with a higher transactionIndex
                    {
                        blockNumber,
                        transactionIndex: { [Sequelize.Op.gt]: transactionIndex },
                    },
                ],
            },
            ...options,
        });
    }

    async findAndRemoveProcessedEvents(timestamp, limit, options) {
        return this.model.destroy({
            where: {
                processed: true,
                createdAt: { [Sequelize.Op.lte]: timestamp },
            },
            limit,
            ...options,
        });
    }

    async findProcessedEvents(timestamp, limit, options) {
        return this.model.findAll({
            where: {
                processed: true,
                createdAt: { [Sequelize.Op.lte]: timestamp },
            },
            order: [['createdAt', 'asc']],
            raw: true,
            limit,
            ...options,
        });
    }
}

export default BlockchainEventRepository;
