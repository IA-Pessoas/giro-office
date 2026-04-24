import { parseWithZod, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  projectPlanAddTaskBodySchema,
  projectPlanDeleteParamsSchema,
  projectPlanDeleteTaskBodySchema,
  projectPlanDetailQuerySchema,
  projectPlanHireBodySchema,
  projectPlanListTasksQuerySchema,
  projectPlanReorderTaskBodySchema,
  projectPlanUpdateBodySchema,
} from "../schemas/projectPlan.schemas.js";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("project-plan schemas (UUID)", () => {
  it("aceita UUIDs validos", () => {
    expect(() =>
      parseWithZod(projectPlanUpdateBodySchema, { id: UUID, name: "x", color: "#000" }),
    ).not.toThrow();
    expect(() => parseWithZod(projectPlanDetailQuerySchema, { plan_id: UUID })).not.toThrow();
    expect(() => parseWithZod(projectPlanDeleteParamsSchema, { id: UUID })).not.toThrow();
    expect(() =>
      parseWithZod(projectPlanAddTaskBodySchema, { plan_id: UUID, task_id: UUID }),
    ).not.toThrow();
    expect(() => parseWithZod(projectPlanListTasksQuerySchema, { plan_id: UUID })).not.toThrow();
    expect(() =>
      parseWithZod(projectPlanReorderTaskBodySchema, {
        plan_id: UUID,
        plan_task_id: UUID,
        direction: "up",
      }),
    ).not.toThrow();
    expect(() =>
      parseWithZod(projectPlanDeleteTaskBodySchema, { plan_id: UUID, plan_task_id: UUID }),
    ).not.toThrow();
    expect(() =>
      parseWithZod(projectPlanHireBodySchema, { project_id: UUID, plan_id: UUID }),
    ).not.toThrow();
  });

  it("rejeita quando um UUID e invalido (400)", () => {
    try {
      parseWithZod(projectPlanDetailQuerySchema, { plan_id: "plan-1" });
      throw new Error("esperava falhar");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err).toMatchObject({ statusCode: 400 });
    }
  });
});
