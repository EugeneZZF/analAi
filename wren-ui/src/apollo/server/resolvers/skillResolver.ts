import { IContext } from '@server/types';
import {
  SkillDocument,
  SaveSkillInput,
  ImportSkillInput,
} from '@server/models/adaptor';
import { getLogger } from '@server/utils';
import {
  ForbiddenApolloError,
  UnauthorizedApolloError,
} from '@server/utils/auth';

const logger = getLogger('SkillResolver');
logger.level = 'debug';

export class SkillResolver {
  constructor() {
    this.getSkills = this.getSkills.bind(this);
    this.getSkill = this.getSkill.bind(this);
    this.createSkill = this.createSkill.bind(this);
    this.updateSkill = this.updateSkill.bind(this);
    this.importSkill = this.importSkill.bind(this);
    this.deleteSkill = this.deleteSkill.bind(this);
    this.addSkillToUser = this.addSkillToUser.bind(this);
    this.removeSkillFromUser = this.removeSkillFromUser.bind(this);
  }

  private enrichSkill(
    skill: SkillDocument,
    metaMap: Map<
      string,
      { authorId: number | null; isPublic: boolean; authorName?: string }
    >,
    userSkillIds: Set<string>,
    currentUserId: number,
  ): SkillDocument {
    const meta = metaMap.get(skill.id);
    const isPublic = meta ? meta.isPublic : skill.isShared !== false;
    const authorId = meta ? meta.authorId : null;
    const isOwner = authorId !== null && authorId === currentUserId;
    const isAdded = isOwner || userSkillIds.has(skill.id);
    const authorName = meta?.authorName || skill.author;

    return {
      ...skill,
      isPublic,
      authorId,
      isAdded,
      authorName,
    };
  }

  public async getSkills(
    _root: any,
    args: { scope?: string },
    ctx: IContext,
  ): Promise<SkillDocument[]> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }

    try {
      let projectId: number | undefined;
      try {
        const project = await ctx.projectService.getCurrentProject();
        projectId = project?.id;
      } catch (_e) {
        // Project may not be initialized yet
      }

      const [rawSkills, metaMap, userSkillIds] = await Promise.all([
        ctx.wrenAIAdaptor.listSkills(projectId),
        ctx.authService.getSkillMetadataMap(),
        ctx.authService.getUserSkillIds(ctx.currentUser.userId),
      ]);

      const enriched = rawSkills.map((s) =>
        this.enrichSkill(s, metaMap, userSkillIds, ctx.currentUser!.userId),
      );

      if (args?.scope === 'library') {
        return enriched.filter((s) => s.isPublic);
      }

      // Active / personal skills: ONLY skills created by current user or explicitly added via user_skills
      return enriched.filter(
        (s) => s.authorId === ctx.currentUser!.userId || userSkillIds.has(s.id),
      );
    } catch (error) {
      logger.error(`Error getting skills: ${error}`);
      return [];
    }
  }

  public async getSkill(
    _root: any,
    args: { where: { id: string } },
    ctx: IContext,
  ): Promise<SkillDocument> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }

    const [skill, metaMap, userSkillIds] = await Promise.all([
      ctx.wrenAIAdaptor.getSkill(args.where.id),
      ctx.authService.getSkillMetadataMap(),
      ctx.authService.getUserSkillIds(ctx.currentUser.userId),
    ]);

    const enriched = this.enrichSkill(
      skill,
      metaMap,
      userSkillIds,
      ctx.currentUser.userId,
    );

    if (
      !enriched.isPublic &&
      enriched.authorId !== ctx.currentUser.userId &&
      ctx.currentUser.role !== 'admin'
    ) {
      throw new ForbiddenApolloError(
        'У вас нет прав для просмотра этого приватного скилла',
      );
    }

    return enriched;
  }

  public async createSkill(
    _root: any,
    args: { data: SaveSkillInput },
    ctx: IContext,
  ): Promise<SkillDocument> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }

    let projectId: string | undefined;
    try {
      const project = await ctx.projectService.getCurrentProject();
      projectId = project?.id?.toString();
    } catch (_e) {
      // ignore
    }

    const isPublic = args.data.isPublic ?? true;
    const saved = await ctx.wrenAIAdaptor.saveSkill({
      ...args.data,
      isShared: isPublic,
      author: args.data.author || ctx.currentUser.name,
      projectId,
    });

    await ctx.authService.upsertSkillMetadata(
      saved.id,
      ctx.currentUser.userId,
      isPublic,
    );
    await ctx.authService.addUserSkill(ctx.currentUser.userId, saved.id);

    return {
      ...saved,
      isPublic,
      authorId: ctx.currentUser.userId,
      isAdded: true,
      authorName: ctx.currentUser.name,
    };
  }

  public async updateSkill(
    _root: any,
    args: { where: { id: string }; data: SaveSkillInput },
    ctx: IContext,
  ): Promise<SkillDocument> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }

    const existingMeta = await ctx.authService.getSkillMetadata(args.where.id);
    if (
      existingMeta?.authorId != null &&
      existingMeta.authorId !== ctx.currentUser.userId &&
      ctx.currentUser.role !== 'admin'
    ) {
      throw new ForbiddenApolloError(
        'У вас недостаточно прав для редактирования чужого скилла',
      );
    }

    let projectId: string | undefined;
    try {
      const project = await ctx.projectService.getCurrentProject();
      projectId = project?.id?.toString();
    } catch (_e) {
      // ignore
    }

    const isPublic =
      args.data.isPublic ?? existingMeta?.isPublic ?? true;

    const saved = await ctx.wrenAIAdaptor.saveSkill({
      ...args.data,
      id: args.where.id,
      isShared: isPublic,
      projectId,
    });

    const ownerId = existingMeta?.authorId ?? ctx.currentUser.userId;
    await ctx.authService.upsertSkillMetadata(saved.id, ownerId, isPublic);

    return {
      ...saved,
      isPublic,
      authorId: ownerId,
      isAdded: true,
      authorName: ctx.currentUser.name,
    };
  }

  public async importSkill(
    _root: any,
    args: { data: ImportSkillInput },
    ctx: IContext,
  ): Promise<SkillDocument> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }

    let projectId: string | undefined;
    try {
      const project = await ctx.projectService.getCurrentProject();
      projectId = project?.id?.toString();
    } catch (_e) {
      // ignore
    }

    const isPublic = args.data.isPublic ?? true;
    const saved = await ctx.wrenAIAdaptor.importSkill({
      ...args.data,
      isShared: isPublic,
      projectId,
    });

    await ctx.authService.upsertSkillMetadata(
      saved.id,
      ctx.currentUser.userId,
      isPublic,
    );
    await ctx.authService.addUserSkill(ctx.currentUser.userId, saved.id);

    return {
      ...saved,
      isPublic,
      authorId: ctx.currentUser.userId,
      isAdded: true,
      authorName: ctx.currentUser.name,
    };
  }

  public async deleteSkill(
    _root: any,
    args: { where: { id: string } },
    ctx: IContext,
  ): Promise<boolean> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }

    const existingMeta = await ctx.authService.getSkillMetadata(args.where.id);
    if (
      existingMeta?.authorId != null &&
      existingMeta.authorId !== ctx.currentUser.userId &&
      ctx.currentUser.role !== 'admin'
    ) {
      throw new ForbiddenApolloError(
        'У вас недостаточно прав для удаления чужого скилла',
      );
    }

    const deleted = await ctx.wrenAIAdaptor.deleteSkill(args.where.id);
    if (deleted) {
      await ctx.authService.deleteSkillMetadata(args.where.id);
    }
    return deleted;
  }

  public async addSkillToUser(
    _root: any,
    args: { where: { id: string } },
    ctx: IContext,
  ): Promise<boolean> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }

    const [skill, meta] = await Promise.all([
      ctx.wrenAIAdaptor.getSkill(args.where.id),
      ctx.authService.getSkillMetadata(args.where.id),
    ]);
    const isPublic = meta ? meta.isPublic : skill.isShared !== false;
    const isOwner = meta?.authorId === ctx.currentUser.userId;

    if (!isPublic && !isOwner && ctx.currentUser.role !== 'admin') {
      throw new ForbiddenApolloError(
        'Нельзя добавить чужой приватный скилл',
      );
    }

    await ctx.authService.addUserSkill(ctx.currentUser.userId, args.where.id);
    return true;
  }

  public async removeSkillFromUser(
    _root: any,
    args: { where: { id: string } },
    ctx: IContext,
  ): Promise<boolean> {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }
    await ctx.authService.removeUserSkill(ctx.currentUser.userId, args.where.id);
    return true;
  }
}
