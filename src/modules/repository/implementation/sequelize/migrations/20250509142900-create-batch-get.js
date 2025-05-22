export async function up({ context: { queryInterface, Sequelize } }) {
    await queryInterface.createTable('batch_get', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        operation_id: {
            type: Sequelize.UUID,
            allowNull: false,
        },
        status: {
            allowNull: false,
            type: Sequelize.STRING,
        },
        created_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('NOW()'),
        },
    });
}
export async function down({ context: { queryInterface } }) {
    await queryInterface.dropTable('batch_get');
}
