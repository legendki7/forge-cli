export {
  createProject,
  defaultProcessExecutor,
  CreateProjectError,
  type CreateProjectOptions,
  type CreateProjectResult,
  type ProcessExecutor,
  type ProcessResult,
} from './scaffold.js';
export {
  NEXTJS_DEPENDENCY_VERSIONS,
  renderNextjsTemplate,
  type RenderedTemplateFile,
} from './nextjs/template.js';
export {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  isTemplateId,
  renderBuiltinTemplate,
  type ForgeKiTemplate,
  type RenderedTemplate,
  type TemplateCategory,
  type TemplateDifficulty,
  type TemplateId,
  type TemplateOptions,
  type TemplateValidationResult,
} from './catalog.js';
export {
  createGenerationPlan,
  executeGenerationPlan,
  validateExecutablePlan,
  GenerationPlanError,
  type PlannedDependency,
  type PlannedFile,
  type PlannedPlugin,
  type PlanOwner,
  type DeclarativePluginPlanSource,
  type ProjectCreationInput,
  type ProjectGenerationPlan,
  type ProjectGenerationResult,
} from './generation-plan.js';
