import bcrypt from 'bcryptjs';
import { Knex } from 'knex';
import {
  AuthUser,
  FORBIDDEN_DATA_MESSAGE,
  ForbiddenApolloError,
  ProjectAccessMode,
  UILanguage,
  UnauthorizedApolloError,
  UserRole,
  signJwt,
  verifyJwt,
} from '@server/utils/auth';

export interface UserRecord {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  language?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  language: UILanguage;
}

export interface ProjectAccessPolicyDTO {
  projectId: number;
  projectName: string;
  datasource: string;
  accessMode: ProjectAccessMode;
  allowedUserIds: number[];
}

export interface SkillMetadataRecord {
  skill_id: string;
  author_id: number | null;
  is_public: boolean | number;
}

let tablesInitialized = false;

export const ensureAuthTables = async (knex: Knex): Promise<void> => {
  if (tablesInitialized) return;

  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('email').notNullable().unique();
      table.string('name').notNullable();
      table.string('password_hash').notNullable();
      table.string('role').notNullable().defaultTo('user');
      table.enu('language', ['ru', 'en']).notNullable().defaultTo('ru');
      table.timestamps(true, true);
    });
  } else if (!(await knex.schema.hasColumn('users', 'language'))) {
    await knex.schema.alterTable('users', (table) => {
      table.enu('language', ['ru', 'en']).notNullable().defaultTo('ru');
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

  tablesInitialized = true;
};

export class AuthService {
  private knex: Knex;

  constructor(knex: Knex) {
    this.knex = knex;
  }

  private toPublicUser(row: UserRecord): PublicUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role === 'admin' ? 'admin' : 'user',
      language: row.language === 'en' ? 'en' : 'ru',
    };
  }

  public async register(input: {
    email: string;
    name: string;
    password: string;
    role?: string;
  }): Promise<{ token: string; user: PublicUser }> {
    await ensureAuthTables(this.knex);
    const email = (input.email || '').trim().toLowerCase();
    const name = (input.name || '').trim();
    const password = input.password || '';
    const role: UserRole = input.role === 'admin' ? 'admin' : 'user';

    if (!email || !name || password.length < 4) {
      throw new Error(
        'Укажите корректный email, имя и пароль (минимум 4 символа)',
      );
    }

    const existing = await this.knex<UserRecord>('users')
      .where({ email })
      .first();
    if (existing) {
      throw new Error('Пользователь с таким email уже существует');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [inserted] = await this.knex<UserRecord>('users')
      .insert({
        email,
        name,
        password_hash: passwordHash,
        role,
      })
      .returning('*');

    const userRow =
      inserted && typeof inserted === 'object'
        ? inserted
        : await this.knex<UserRecord>('users').where({ email }).first();

    const user = this.toPublicUser(userRow!);
    const token = signJwt({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return { token, user };
  }

  public async login(input: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: PublicUser }> {
    await ensureAuthTables(this.knex);
    const email = (input.email || '').trim().toLowerCase();
    const password = input.password || '';

    const userRow = await this.knex<UserRecord>('users')
      .where({ email })
      .first();
    if (!userRow) {
      throw new Error('Неверный email или пароль');
    }

    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) {
      throw new Error('Неверный email или пароль');
    }

    const user = this.toPublicUser(userRow);
    const token = signJwt({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return { token, user };
  }

  public async getUserFromToken(token: string | null): Promise<AuthUser | null> {
    if (!token) return null;
    const payload = verifyJwt(token);
    if (!payload) return null;
    await ensureAuthTables(this.knex);
    const row = await this.knex<UserRecord>('users')
      .where({ id: payload.userId })
      .first();
    if (!row) return null;
    return {
      userId: row.id,
      email: row.email,
      name: row.name,
      role: row.role === 'admin' ? 'admin' : 'user',
      language: row.language === 'en' ? 'en' : 'ru',
    };
  }

  public async updateUserLanguage(
    userId: number,
    language: string,
  ): Promise<PublicUser> {
    await ensureAuthTables(this.knex);
    if (language !== 'ru' && language !== 'en') {
      throw new Error('Поддерживаются только языки ru и en');
    }
    await this.knex<UserRecord>('users')
      .where({ id: userId })
      .update({
        language,
        updated_at: this.knex.fn.now(),
      });
    const updated = await this.knex<UserRecord>('users')
      .where({ id: userId })
      .first();
    if (!updated) {
      throw new Error('Пользователь не найден');
    }
    return this.toPublicUser(updated);
  }

  public async listUsers(): Promise<PublicUser[]> {
    await ensureAuthTables(this.knex);
    const rows = await this.knex<UserRecord>('users')
      .select('id', 'email', 'name', 'role', 'language')
      .orderBy('id', 'asc');
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role === 'admin' ? 'admin' : 'user',
      language: row.language === 'en' ? 'en' : 'ru',
    }));
  }

  public async listProjectPolicies(): Promise<ProjectAccessPolicyDTO[]> {
    await ensureAuthTables(this.knex);
    const projects = await this.knex('project').select(
      'id',
      'display_name',
      'type',
    );
    const policies = await this.knex('project_access_policies').select('*');
    const whitelist = await this.knex('project_access_users').select('*');

    const policyMap = new Map<number, ProjectAccessMode>();
    for (const p of policies) {
      policyMap.set(p.project_id, p.access_mode as ProjectAccessMode);
    }

    const usersMap = new Map<number, number[]>();
    for (const w of whitelist) {
      const list = usersMap.get(w.project_id) || [];
      list.push(w.user_id);
      usersMap.set(w.project_id, list);
    }

    return projects.map((proj) => ({
      projectId: proj.id,
      projectName: proj.display_name || `Project #${proj.id}`,
      datasource: proj.type || 'UNKNOWN',
      accessMode: policyMap.get(proj.id) || 'public',
      allowedUserIds: usersMap.get(proj.id) || [],
    }));
  }

  public async updateProjectPolicy(
    projectId: number,
    accessMode: ProjectAccessMode,
    allowedUserIds: number[] = [],
  ): Promise<ProjectAccessPolicyDTO> {
    await ensureAuthTables(this.knex);
    if (!['public', 'admin_only', 'specific_users'].includes(accessMode)) {
      throw new Error('Некорректный режим доступа к базе данных');
    }

    const existing = await this.knex('project_access_policies')
      .where({ project_id: projectId })
      .first();
    if (existing) {
      await this.knex('project_access_policies')
        .where({ project_id: projectId })
        .update({
          access_mode: accessMode,
          updated_at: this.knex.fn.now(),
        });
    } else {
      await this.knex('project_access_policies').insert({
        project_id: projectId,
        access_mode: accessMode,
      });
    }

    await this.knex('project_access_users')
      .where({ project_id: projectId })
      .delete();

    if (accessMode === 'specific_users' && allowedUserIds.length > 0) {
      const uniqueIds = Array.from(new Set(allowedUserIds.map(Number))).filter(
        (id) => Number.isFinite(id) && id > 0,
      );
      if (uniqueIds.length > 0) {
        await this.knex('project_access_users').insert(
          uniqueIds.map((userId) => ({
            project_id: projectId,
            user_id: userId,
          })),
        );
      }
    }

    const all = await this.listProjectPolicies();
    const updated = all.find((p) => p.projectId === projectId);
    if (!updated) {
      throw new Error('Проект не найден');
    }
    return updated;
  }

  public async checkProjectAccess(
    user: AuthUser | null,
    projectId?: number | null,
  ): Promise<boolean> {
    if (!user) return false;
    if (user.role === 'admin') return true;
    await ensureAuthTables(this.knex);

    let targetProjectId = projectId;
    if (!targetProjectId) {
      const firstProject = await this.knex('project')
        .select('id')
        .orderBy('id', 'asc')
        .first();
      if (!firstProject) return true;
      targetProjectId = firstProject.id;
    }

    const policy = await this.knex('project_access_policies')
      .where({ project_id: targetProjectId })
      .first();

    const mode: ProjectAccessMode =
      (policy?.access_mode as ProjectAccessMode) || 'public';

    if (mode === 'public') return true;
    if (mode === 'admin_only') return false;
    if (mode === 'specific_users') {
      const allowed = await this.knex('project_access_users')
        .where({ project_id: targetProjectId, user_id: user.userId })
        .first();
      return Boolean(allowed);
    }
    return false;
  }

  public async assertProjectAccess(
    user: AuthUser | null,
    projectId?: number | null,
  ): Promise<void> {
    if (!user) {
      throw new UnauthorizedApolloError();
    }
    const allowed = await this.checkProjectAccess(user, projectId);
    if (!allowed) {
      throw new ForbiddenApolloError(FORBIDDEN_DATA_MESSAGE);
    }
  }

  // Skills visibility & user_skills helpers
  public async getSkillMetadataMap(): Promise<
    Map<string, { authorId: number | null; isPublic: boolean; authorName?: string }>
  > {
    await ensureAuthTables(this.knex);
    const rows = await this.knex('skill_metadata as sm')
      .leftJoin('users as u', 'sm.author_id', 'u.id')
      .select(
        'sm.skill_id',
        'sm.author_id',
        'sm.is_public',
        'u.name as author_name',
      );
    const map = new Map<
      string,
      { authorId: number | null; isPublic: boolean; authorName?: string }
    >();
    for (const row of rows) {
      map.set(row.skill_id, {
        authorId: row.author_id ?? null,
        isPublic: Boolean(row.is_public),
        authorName: row.author_name || undefined,
      });
    }
    return map;
  }

  public async getSkillMetadata(skillId: string): Promise<{
    skillId: string;
    authorId: number | null;
    isPublic: boolean;
  } | null> {
    await ensureAuthTables(this.knex);
    const row = await this.knex('skill_metadata')
      .where({ skill_id: skillId })
      .first();
    if (!row) return null;
    return {
      skillId: row.skill_id,
      authorId: row.author_id ?? null,
      isPublic: Boolean(row.is_public),
    };
  }

  public async upsertSkillMetadata(
    skillId: string,
    authorId: number | null,
    isPublic: boolean,
  ): Promise<void> {
    await ensureAuthTables(this.knex);
    const existing = await this.knex('skill_metadata')
      .where({ skill_id: skillId })
      .first();
    if (existing) {
      await this.knex('skill_metadata')
        .where({ skill_id: skillId })
        .update({
          is_public: isPublic,
          ...(existing.author_id == null && authorId != null
            ? { author_id: authorId }
            : {}),
          updated_at: this.knex.fn.now(),
        });
    } else {
      await this.knex('skill_metadata').insert({
        skill_id: skillId,
        author_id: authorId,
        is_public: isPublic,
      });
    }
  }

  public async deleteSkillMetadata(skillId: string): Promise<void> {
    await ensureAuthTables(this.knex);
    await this.knex('skill_metadata').where({ skill_id: skillId }).delete();
    await this.knex('user_skills').where({ skill_id: skillId }).delete();
  }

  public async getUserSkillIds(userId: number): Promise<Set<string>> {
    await ensureAuthTables(this.knex);
    const rows = await this.knex('user_skills')
      .where({ user_id: userId })
      .select('skill_id');
    return new Set(rows.map((r) => r.skill_id));
  }

  public async addUserSkill(userId: number, skillId: string): Promise<void> {
    await ensureAuthTables(this.knex);
    const existing = await this.knex('user_skills')
      .where({ user_id: userId, skill_id: skillId })
      .first();
    if (!existing) {
      await this.knex('user_skills').insert({
        user_id: userId,
        skill_id: skillId,
      });
    }
  }

  public async removeUserSkill(userId: number, skillId: string): Promise<void> {
    await ensureAuthTables(this.knex);
    await this.knex('user_skills')
      .where({ user_id: userId, skill_id: skillId })
      .delete();
  }
}
