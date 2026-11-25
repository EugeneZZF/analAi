import GraphQLJSON from 'graphql-type-json';
import { ProjectResolver } from './resolvers/projectResolver';
import { ModelResolver } from './resolvers/modelResolver';
import { AskingResolver } from './resolvers/askingResolver';
import { DiagramResolver } from './resolvers/diagramResolver';
import { LearningResolver } from './resolvers/learningResolver';
import { DashboardResolver } from './resolvers/dashboardResolver';
import { SqlPairResolver } from './resolvers/sqlPairResolver';
import { InstructionResolver } from './resolvers/instructionResolver';
import { SkillResolver } from './resolvers/skillResolver';
import { ApiHistoryResolver } from './resolvers/apiHistoryResolver';
import { convertColumnType } from '@server/utils';
import { DialectSQLScalar } from './scalars';
import { IContext } from '@server/types';
import { UnauthorizedApolloError } from '@server/utils/auth';

const withAuth = <TArgs = any, TResult = any>(
  resolver: (root: any, args: TArgs, ctx: IContext, info: any) => Promise<TResult> | TResult,
) => {
  return async (root: any, args: TArgs, ctx: IContext, info: any) => {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }
    return resolver(root, args, ctx, info);
  };
};

const withProjectAccess = <TArgs = any, TResult = any>(
  resolver: (root: any, args: TArgs, ctx: IContext, info: any) => Promise<TResult> | TResult,
) => {
  return async (root: any, args: TArgs, ctx: IContext, info: any) => {
    if (!ctx.currentUser) {
      throw new UnauthorizedApolloError();
    }
    let projectId: number | null = null;
    try {
      const project = await ctx.projectService.getCurrentProject();
      projectId = project?.id ?? null;
    } catch (_e) {
      projectId = null;
    }
    await ctx.authService.assertProjectAccess(ctx.currentUser, projectId);
    return resolver(root, args, ctx, info);
  };
};

const projectResolver = new ProjectResolver();
const modelResolver = new ModelResolver();
const askingResolver = new AskingResolver();
const diagramResolver = new DiagramResolver();
const learningResolver = new LearningResolver();
const dashboardResolver = new DashboardResolver();
const sqlPairResolver = new SqlPairResolver();
const instructionResolver = new InstructionResolver();
const skillResolver = new SkillResolver();
const apiHistoryResolver = new ApiHistoryResolver();
const resolvers = {
  JSON: GraphQLJSON,
  DialectSQL: DialectSQLScalar,
  Query: {
    listDataSourceTables: withProjectAccess(projectResolver.listDataSourceTables),
    autoGenerateRelation: withProjectAccess(projectResolver.autoGenerateRelation),
    listModels: withProjectAccess(modelResolver.listModels),
    model: withProjectAccess(modelResolver.getModel),
    onboardingStatus: withAuth(projectResolver.getOnboardingStatus),
    modelSync: withProjectAccess(modelResolver.checkModelSync),
    diagram: withProjectAccess(diagramResolver.getDiagram),
    schemaChange: withProjectAccess(projectResolver.getSchemaChange),

    // Ask
    askingTask: withProjectAccess(askingResolver.getAskingTask),
    suggestedQuestions: withProjectAccess(askingResolver.getSuggestedQuestions),
    instantRecommendedQuestions: withProjectAccess(
      askingResolver.getInstantRecommendedQuestions,
    ),

    // Adjustment
    adjustmentTask: withProjectAccess(askingResolver.getAdjustmentTask),

    // Thread
    thread: withProjectAccess(askingResolver.getThread),
    threads: withProjectAccess(askingResolver.listThreads),
    threadResponse: withProjectAccess(askingResolver.getResponse),
    nativeSql: withProjectAccess(modelResolver.getNativeSql),

    // Views
    listViews: withProjectAccess(modelResolver.listViews),
    view: withProjectAccess(modelResolver.getView),

    // Settings
    settings: withAuth(projectResolver.getSettings),
    getMDL: withProjectAccess(modelResolver.getMDL),

    // Learning
    learningRecord: withAuth(learningResolver.getLearningRecord),

    // Recommendation questions
    getThreadRecommendationQuestions: withProjectAccess(
      askingResolver.getThreadRecommendationQuestions,
    ),
    getProjectRecommendationQuestions: withProjectAccess(
      projectResolver.getProjectRecommendationQuestions,
    ),

    // Dashboard
    dashboardItems: withProjectAccess(dashboardResolver.getDashboardItems),
    dashboard: withProjectAccess(dashboardResolver.getDashboard),

    // SQL Pairs
    sqlPairs: withProjectAccess(sqlPairResolver.getProjectSqlPairs),
    // Instructions
    instructions: withProjectAccess(instructionResolver.getInstructions),
    // Skills Library
    skills: skillResolver.getSkills,
    skill: skillResolver.getSkill,

    // API History
    apiHistory: withProjectAccess(apiHistoryResolver.getApiHistory),
  },
  Mutation: {
    deploy: withProjectAccess(modelResolver.deploy),
    saveDataSource: withProjectAccess(projectResolver.saveDataSource),
    startSampleDataset: withProjectAccess(projectResolver.startSampleDataset),
    saveTables: withProjectAccess(projectResolver.saveTables),
    saveRelations: withProjectAccess(projectResolver.saveRelations),
    createModel: withProjectAccess(modelResolver.createModel),
    updateModel: withProjectAccess(modelResolver.updateModel),
    deleteModel: withProjectAccess(modelResolver.deleteModel),
    previewModelData: withProjectAccess(modelResolver.previewModelData),
    updateModelMetadata: withProjectAccess(modelResolver.updateModelMetadata),
    triggerDataSourceDetection: withProjectAccess(
      projectResolver.triggerDataSourceDetection,
    ),
    resolveSchemaChange: withProjectAccess(projectResolver.resolveSchemaChange),

    // calculated field
    createCalculatedField: withProjectAccess(modelResolver.createCalculatedField),
    validateCalculatedField: withProjectAccess(
      modelResolver.validateCalculatedField,
    ),
    updateCalculatedField: withProjectAccess(modelResolver.updateCalculatedField),
    deleteCalculatedField: withProjectAccess(modelResolver.deleteCalculatedField),

    // relation
    createRelation: withProjectAccess(modelResolver.createRelation),
    updateRelation: withProjectAccess(modelResolver.updateRelation),
    deleteRelation: withProjectAccess(modelResolver.deleteRelation),

    // Ask
    createAskingTask: withProjectAccess(askingResolver.createAskingTask),
    cancelAskingTask: withProjectAccess(askingResolver.cancelAskingTask),
    createInstantRecommendedQuestions: withProjectAccess(
      askingResolver.createInstantRecommendedQuestions,
    ),
    rerunAskingTask: withProjectAccess(askingResolver.rerunAskingTask),

    // Adjustment
    adjustThreadResponse: withProjectAccess(askingResolver.adjustThreadResponse),
    cancelAdjustmentTask: withProjectAccess(
      askingResolver.cancelAdjustThreadResponseAnswer,
    ),
    rerunAdjustmentTask: withProjectAccess(
      askingResolver.rerunAdjustThreadResponseAnswer,
    ),

    // Thread
    createThread: withProjectAccess(askingResolver.createThread),
    updateThread: withProjectAccess(askingResolver.updateThread),
    deleteThread: withProjectAccess(askingResolver.deleteThread),
    createThreadResponse: withProjectAccess(askingResolver.createThreadResponse),
    updateThreadResponse: withProjectAccess(askingResolver.updateThreadResponse),
    previewData: withProjectAccess(askingResolver.previewData),
    previewBreakdownData: withProjectAccess(askingResolver.previewBreakdownData),

    // Generate Thread Response Breakdown
    generateThreadResponseBreakdown: withProjectAccess(
      askingResolver.generateThreadResponseBreakdown,
    ),

    // Generate Thread Response Answer
    generateThreadResponseAnswer: withProjectAccess(
      askingResolver.generateThreadResponseAnswer,
    ),

    // Generate Thread Response Chart
    generateThreadResponseChart: withProjectAccess(
      askingResolver.generateThreadResponseChart,
    ),

    // Adjust Thread Response Chart
    adjustThreadResponseChart: withProjectAccess(
      askingResolver.adjustThreadResponseChart,
    ),

    // Views
    createView: withProjectAccess(modelResolver.createView),
    deleteView: withProjectAccess(modelResolver.deleteView),
    previewViewData: withProjectAccess(modelResolver.previewViewData),
    validateView: withProjectAccess(modelResolver.validateView),
    updateViewMetadata: withProjectAccess(modelResolver.updateViewMetadata),

    // Settings
    resetCurrentProject: withProjectAccess(projectResolver.resetCurrentProject),
    updateCurrentProject: withProjectAccess(projectResolver.updateCurrentProject),
    updateDataSource: withProjectAccess(projectResolver.updateDataSource),

    // preview
    previewSql: withProjectAccess(modelResolver.previewSql),

    // Learning
    saveLearningRecord: withAuth(learningResolver.saveLearningRecord),

    // Recommendation questions
    generateThreadRecommendationQuestions: withProjectAccess(
      askingResolver.generateThreadRecommendationQuestions,
    ),
    generateProjectRecommendationQuestions: withProjectAccess(
      askingResolver.generateProjectRecommendationQuestions,
    ),

    // Dashboard
    updateDashboardItemLayouts: withProjectAccess(
      dashboardResolver.updateDashboardItemLayouts,
    ),
    createDashboardItem: withProjectAccess(dashboardResolver.createDashboardItem),
    updateDashboardItem: withProjectAccess(dashboardResolver.updateDashboardItem),
    deleteDashboardItem: withProjectAccess(dashboardResolver.deleteDashboardItem),
    previewItemSQL: withProjectAccess(dashboardResolver.previewItemSQL),
    setDashboardSchedule: withProjectAccess(dashboardResolver.setDashboardSchedule),

    // SQL Pairs
    createSqlPair: withProjectAccess(sqlPairResolver.createSqlPair),
    updateSqlPair: withProjectAccess(sqlPairResolver.updateSqlPair),
    deleteSqlPair: withProjectAccess(sqlPairResolver.deleteSqlPair),
    generateQuestion: withProjectAccess(sqlPairResolver.generateQuestion),
    modelSubstitute: withProjectAccess(sqlPairResolver.modelSubstitute),
    // Instructions
    createInstruction: withProjectAccess(instructionResolver.createInstruction),
    updateInstruction: withProjectAccess(instructionResolver.updateInstruction),
    deleteInstruction: withProjectAccess(instructionResolver.deleteInstruction),
    // Skills Library
    createSkill: skillResolver.createSkill,
    updateSkill: skillResolver.updateSkill,
    importSkill: skillResolver.importSkill,
    deleteSkill: skillResolver.deleteSkill,
    addSkillToUser: skillResolver.addSkillToUser,
    removeSkillFromUser: skillResolver.removeSkillFromUser,
  },
  ThreadResponse: askingResolver.getThreadResponseNestedResolver(),
  DetailStep: askingResolver.getDetailStepNestedResolver(),
  ResultCandidate: askingResolver.getResultCandidateNestedResolver(),

  // Handle struct type to record for UI
  DiagramModelField: { type: convertColumnType },
  DiagramModelNestedField: { type: convertColumnType },
  CompactColumn: { type: convertColumnType },
  FieldInfo: { type: convertColumnType },
  DetailedColumn: { type: convertColumnType },
  DetailedNestedColumn: { type: convertColumnType },
  DetailedChangeColumn: { type: convertColumnType },

  // Add this line to include the SqlPair nested resolver
  SqlPair: sqlPairResolver.getSqlPairNestedResolver(),

  // Add ApiHistoryResponse nested resolvers
  ApiHistoryResponse: apiHistoryResolver.getApiHistoryNestedResolver(),
};

export default resolvers;
