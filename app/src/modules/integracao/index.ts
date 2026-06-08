export { ClientProjectsSection } from "./components/ClientProjectsSection";
export { ProjectDetailView } from "./components/ProjectDetailView";
export { ProjectFormModal } from "./components/ProjectFormModal";
export { ProjectListTable } from "./components/ProjectListTable";
export { ProjectProgressBar } from "./components/ProjectProgressBar";
export { ProjectsWorkspace } from "./components/ProjectsWorkspace";
export { TaskModelModal } from "./components/TaskModelModal";

export {
  projectDetailQueryKey,
  projectListQueryKey,
  PROJECTS_QUERY_KEY,
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useProjectDetail,
  useProjectForm,
  useProjectsList,
  useRecalculateProjectProgressMutation,
  useTaskModels,
  useUpdateProjectMutation,
} from "./hooks";

export { integracaoTasksService, projectService, taskModelService } from "./services";

export type {
  CreateProjectData,
  CreateTaskModelData,
  DeleteProjectData,
  ProjectClientSummary,
  ProjectDetail,
  ProjectFormValues,
  ProjectListItem,
  ProjectListParams,
  ProjectProgressResponse,
  ProjectTaskSummary,
  RecalculateProjectProgressData,
  TaskDependent,
  TaskModel,
  UpdateProjectData,
  UpdateTaskModelData,
} from "./types";
