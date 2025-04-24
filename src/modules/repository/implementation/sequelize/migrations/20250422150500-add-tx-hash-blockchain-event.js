export async function up({ context: { queryInterface, Sequelize } }) {
    async function columnExists(table, column) {
        const tableDescription = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(tableDescription, column);
    }

    if (!(await columnExists('blockchain_event', 'tx_hash'))) {
        await queryInterface.addColumn('blockchain_event', 'tx_hash', {
            type: Sequelize.STRING,
        });
    }
}

export async function down({ context: { queryInterface } }) {
    async function columnExists(table, column) {
        const tableDescription = await queryInterface.describeTable(table);
        return Object.prototype.hasOwnProperty.call(tableDescription, column);
    }

    if (await columnExists('blockchain_event', 'tx_hash')) {
        await queryInterface.removeColumn('blockchain_event', 'tx_hash');
    }
}
