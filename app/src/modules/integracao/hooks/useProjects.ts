import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import type {
  CreateProjectData,
  ProjectDetail,
  ProjectListItem,
  ProjectListParams,
  ProjectProgressResponse,
  UpdateProjectData,
} from "../types";
import { projectService } from "../services/projectService";
import { projectDetailQueryKey, projectListQueryKey, PROJECTS_QUERY_KEY } from "./queryKeys";

export function useProjectsList(
  params: ProjectListParams | null,
): UseQueryResult<ProjectListItem[], Error> {
  return useFetch(
    projectListQueryKey(params ?? { ref: "client", id: "missing" }),
    () => projectService.list(params as ProjectListParams),
    {
      enabled: Boolean(params?.id),
      placeholderData: (previousData) => previousData,
    },
  );
}

export function useProjectDetail(projectId: string | undefined): UseQueryResult<ProjectDetail, Error> {
  return useFetch(
    projectDetailQueryKey(projectId ?? "missing"),
    () => projectService.detail(projectId ?? ""),
    {
      enabled: Boolean(projectId),
    },
  );
}

export function useCreateProjectMutation(): UseMutationResult<
  ProjectListItem,
  Error,
  CreateProjectData
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => projectService.create(payload),
    onSuccess: async (project, variables) => {
      queryClient.setQueryData(projectDetailQueryKey(project.id), project);
      await queryClient.invalidateQueries({
        queryKey: projectListQueryKey({ ref: "client", id: variables.client_id }),
      });
    },
  });
}

export function useUpdateProjectMutation(): UseMutationResult<
  ProjectDetail,
  Error,
  UpdateProjectData & { clientId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clientId: _clientId, ...payload }) => projectService.update(payload),
    onSuccess: async (project, variables) => {
      queryClient.setQueryData(projectDetailQueryKey(variables.project_id), project);
      await queryClient.invalidateQueries({
        queryKey: projectListQueryKey({ ref: "client", id: variables.clientId }),
      });
    },
  });
}

export function useDeleteProjectMutation(): UseMutationResult<
  void,
  Error,
  { projectId: string; clientId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId }) => projectService.delete(projectId),
    onSuccess: async (_result, variables) => {
      queryClient.removeQueries({ queryKey: projectDetailQueryKey(variables.projectId) });
      await queryClient.invalidateQueries({
        queryKey: projectListQueryKey({ ref: "client", id: variables.clientId }),
      });
    },
  });
}

export function useRecalculateProjectProgressMutation(): UseMutationResult<
  ProjectProgressResponse,
  Error,
  { projectId: string; clientId: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId }) => projectService.recalculateProgress(projectId),
    onSuccess: async (progress, variables) => {
      queryClient.setQueryData<ProjectDetail | undefined>(
        projectDetailQueryKey(variables.projectId),
        (current) =>
          current
            ? {
                ...current,
                porcentage: progress.porcentage,
                status: progress.status,
              }
            : current,
      );

      await queryClient.invalidateQueries({
        queryKey: projectListQueryKey({ ref: "client", id: variables.clientId }),
      });
    },
  });
}

export function invalidateProjectsQueryCache(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
}
