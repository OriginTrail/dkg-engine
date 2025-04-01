export async function up({ context: { queryInterface } }) {
    await queryInterface.sequelize.query('TRUNCATE TABLE commands;');
}

export async function down() {
    // No need to do anything in the down method for truncation
}
