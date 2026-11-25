import { IContext } from '@server/types';
import {
  SkillDocument,
  SaveSkillInput,
  ImportSkillInput,
} from '@server/models/adaptor';
import { getLogger } from '@server/utils';

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
  }

  public async getSkills(
    _root: any,
    _args: any,
    ctx: IContext,
  ): Promise<SkillDocument[]> {
    try {
      let projectId: number | undefined;
      try {
        const project = await ctx.projectService.getCurrentProject();
        projectId = project?.id;
      } catch (_e) {
        // Project may not be initialized yet
      }
      return await ctx.wrenAIAdaptor.listSkills(projectId);
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
    return await ctx.wrenAIAdaptor.getSkill(args.where.id);
  }

  public async createSkill(
    _root: any,
    args: { data: SaveSkillInput },
    ctx: IContext,
  ): Promise<SkillDocument> {
    let projectId: string | undefined;
    try {
      const project = await ctx.projectService.getCurrentProject();
      projectId = project?.id?.toString();
    } catch (_e) {
      // ignore
    }
    return await ctx.wrenAIAdaptor.saveSkill({
      ...args.data,
      projectId,
    });
  }

  public async updateSkill(
    _root: any,
    args: { where: { id: string }; data: SaveSkillInput },
    ctx: IContext,
  ): Promise<SkillDocument> {
    let projectId: string | undefined;
    try {
      const project = await ctx.projectService.getCurrentProject();
      projectId = project?.id?.toString();
    } catch (_e) {
      // ignore
    }
    return await ctx.wrenAIAdaptor.saveSkill({
      ...args.data,
      id: args.where.id,
      projectId,
    });
  }

  public async importSkill(
    _root: any,
    args: { data: ImportSkillInput },
    ctx: IContext,
  ): Promise<SkillDocument> {
    let projectId: string | undefined;
    try {
      const project = await ctx.projectService.getCurrentProject();
      projectId = project?.id?.toString();
    } catch (_e) {
      // ignore
    }
    return await ctx.wrenAIAdaptor.importSkill({
      ...args.data,
      projectId,
    });
  }

  public async deleteSkill(
    _root: any,
    args: { where: { id: string } },
    ctx: IContext,
  ): Promise<boolean> {
    return await ctx.wrenAIAdaptor.deleteSkill(args.where.id);
  }
}
