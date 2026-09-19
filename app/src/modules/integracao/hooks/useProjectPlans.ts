import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { projectPlanService } from "../services/projectPlanService";
import type {
  ProjectPlan,
  ProjectPlanHireResult,
  ProjectPlanTask,
} from "../services/projectPlanService.contract";
import { INTEGRACAO_TASKS_QUERY_KEY, projectDetailQueryKey } from "./queryKeys";

export const PROJECT_PLANS_QUERY_KEY = ["project-plans"] as const;

export function useProjectPlans(): UseQueryResult<ProjectPlan[], Error> {
  return useFetch(PROJECT_PLANS_QUERY_KEY, () => projectPlanService.list());
}

export function useProjectPlanTasks(planId: string | null): UseQueryResult<ProjectPlanTask[], Error> {
  return useFetch(
    [...PROJECT_PLANS_QUERY_KEY, "tasks", planId ?? "missing"],
    () => projectPlanService.listTasks(planId ?? ""),
    { enabled: Boolean(planId) },
  );
}

export function useHireProjectPlanMutation() {
  const queryClient = useQueryClient();

  return useMutation<ProjectPlanHireResult, Error, { plan_id: string; project_id: string }>({
    mutationFn: projectPlanService.hire,
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(variables.project_id) }),
        queryClient.invalidateQueries({ queryKey: INTEGRACAO_TASKS_QUERY_KEY }),
      ]);
    },
  });
}
