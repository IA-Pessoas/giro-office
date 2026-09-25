import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const zUuid = (field: string) =>
  z.string().uuid({
    message: `${field} inválido.`,
  });

export const projectPlanCreateBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    color: zNonEmptyText("color"),
  })
  .strict();

export const projectPlanUpdateBodySchema = z
  .object({
    id: zUuid("id"),
    name: zNonEmptyText("name"),
    color: zNonEmptyText("color"),
  })
  .strict();

export const projectPlanDetailQuerySchema = z
  .object({
    plan_id: zUuid("plan_id"),
  })
  .strict();

export const projectPlanDeleteParamsSchema = z
  .object({
    id: zUuid("id"),
  })
  .strict();

export const projectPlanAddTaskBodySchema = z
  .object({
    plan_id: zUuid("plan_id"),
    task_id: zUuid("task_id"),
  })
  .strict();

export const projectPlanListTasksQuerySchema = z
  .object({
    plan_id: zUuid("plan_id"),
  })
  .strict();

export const projectPlanReorderTaskBodySchema = z
  .object({
    plan_id: zUuid("plan_id"),
    plan_task_id: zUuid("plan_task_id"),
    direction: z.enum(["up", "down"]),
  })
  .strict();

export const projectPlanDeleteTaskBodySchema = z
  .object({
    plan_id: zUuid("plan_id"),
    plan_task_id: zUuid("plan_task_id"),
  })
  .strict();

export const projectPlanHireBodySchema = z
  .object({
    project_id: zUuid("project_id"),
    plan_id: zUuid("plan_id"),
  })
  .strict();
