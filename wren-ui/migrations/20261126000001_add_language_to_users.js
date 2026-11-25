/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasLanguage = await knex.schema.hasColumn('users', 'language');
  if (!hasLanguage) {
    await knex.schema.alterTable('users', (table) => {
      table
        .enu('language', ['ru', 'en'])
        .notNullable()
        .defaultTo('ru');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasLanguage = await knex.schema.hasColumn('users', 'language');
  if (hasLanguage) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('language');
    });
  }
};
