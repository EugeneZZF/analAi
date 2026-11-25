/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('email').notNullable().unique();
      table.string('name').notNullable();
      table.string('password_hash').notNullable();
      table.string('role').notNullable().defaultTo('user');
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('project_access_policies'))) {
    await knex.schema.createTable('project_access_policies', (table) => {
      table.increments('id').primary();
      table
        .integer('project_id')
        .notNullable()
        .unique()
        .references('id')
        .inTable('project')
        .onDelete('CASCADE');
      table.string('access_mode').notNullable().defaultTo('public');
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('project_access_users'))) {
    await knex.schema.createTable('project_access_users', (table) => {
      table.increments('id').primary();
      table
        .integer('project_id')
        .notNullable()
        .references('id')
        .inTable('project')
        .onDelete('CASCADE');
      table
        .integer('user_id')
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      table.unique(['project_id', 'user_id']);
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('skill_metadata'))) {
    await knex.schema.createTable('skill_metadata', (table) => {
      table.string('skill_id').primary();
      table
        .integer('author_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.boolean('is_public').notNullable().defaultTo(true);
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('user_skills'))) {
    await knex.schema.createTable('user_skills', (table) => {
      table.increments('id').primary();
      table
        .integer('user_id')
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');
      table.string('skill_id').notNullable();
      table.unique(['user_id', 'skill_id']);
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('user_skills');
  await knex.schema.dropTableIfExists('skill_metadata');
  await knex.schema.dropTableIfExists('project_access_users');
  await knex.schema.dropTableIfExists('project_access_policies');
  await knex.schema.dropTableIfExists('users');
};
