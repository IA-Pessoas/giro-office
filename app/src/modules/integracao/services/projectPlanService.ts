import { setupAPIClient } from "@shared/services/api";

import {
  buildCreateProjectPlanPayload,
  buildHireProjectPlanPayload,
  buildUpdateProjectPlanPayload,
  PROJECT_PLAN_ENDPOINTS,
  unwrapProjectPlanCreated,
  unwrapProjectPlanDetail,
  unwrapProjectPlanHire,
  unwrapProjectPlanList,
  unwrapProjectPlanTask,
  unwrapProjectPlanTasks,
  unwrapProjectPlanUpdated,
  type ProjectPlan,
  type ProjectPlanDetail,
  type ProjectPlanHireResult,
  type ProjectPlanTask,
} from "./projectPlanService.contract";

export const projectPlanService = {
  async list(): Promise<ProjectPlan[]> {
    const response = await setupAPIClient().get(PROJECT_PLAN_ENDPOINTS.list);
    return unwrapProjectPlanList(response.data);
  },

  async detail(planId: string): Promise<ProjectPlanDetail> {
    const response = await setupAPIClient().get(PROJECT_PLAN_ENDPOINTS.crud, {
      params: { plan_id: planId },
    });
    return unwrapProjectPlanDetail(response.data);
  },

  async create(payload: Pick<ProjectPlan, "name" | "color">): Promise<ProjectPlan> {
    const response = await setupAPIClient().post(
      PROJECT_PLAN_ENDPOINTS.crud,
      buildCreateProjectPlanPayload(payload),
    );
    return unwrapProjectPlanCreated(response.data);
  },

  async update(payload: ProjectPlan): Promise<ProjectPlan> {
    const response = await setupAPIClient().put(
      PROJECT_PLAN_ENDPOINTS.crud,
      buildUpdateProjectPlanPayload(payload),
    );
    return unwrapProjectPlanUpdated(response.data);
  },

  async delete(planId: string): Promise<void> {
    await setupAPIClient().delete(PROJECT_PLAN_ENDPOINTS.crud, { data: { id: planId } });
  },

  async listTasks(planId: string): Promise<ProjectPlanTask[]> {
    const response = await setupAPIClient().get(PROJECT_PLAN_ENDPOINTS.taskList, {
      params: { plan_id: planId },
    });
    return unwrapProjectPlanTasks(response.data);
  },

  async addTask(payload: { plan_id: string; task_id: string }): Promise<ProjectPlanTask> {
    const response = await setupAPIClient().post(PROJECT_PLAN_ENDPOINTS.task, payload);
    return unwrapProjectPlanTask(response.data);
  },

  async reorderTask(payload: { plan_id: string; plan_task_id: string; direction: "up" | "down" }) {
    await setupAPIClient().put(PROJECT_PLAN_ENDPOINTS.task, payload);
  },

  async deleteTask(payload: { plan_id: string; plan_task_id: string }): Promise<void> {
    await setupAPIClient().delete(PROJECT_PLAN_ENDPOINTS.task, { data: payload });
  },

  async hire(payload: { plan_id: string; project_id: string }): Promise<ProjectPlanHireResult> {
    const response = await setupAPIClient().post(
      PROJECT_PLAN_ENDPOINTS.hire,
      buildHireProjectPlanPayload(payload),
    );
    return unwrapProjectPlanHire(response.data);
  },
};
