export async function up({ context: { queryInterface, Sequelize } }) {
    await queryInterface.createTable('triples_insert_count', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        count: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },
    });
}

export async function down() {
    // No need to do anything in the down method for truncation
}
