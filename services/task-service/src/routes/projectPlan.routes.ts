import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  projectPlanAddTaskBodySchema,
  projectPlanCreateBodySchema,
  projectPlanDeleteParamsSchema,
  projectPlanDeleteTaskBodySchema,
  projectPlanDetailQuerySchema,
  projectPlanHireBodySchema,
  projectPlanListTasksQuerySchema,
  projectPlanReorderTaskBodySchema,
  projectPlanUpdateBodySchema,
} from "../schemas/projectPlan.schemas.js";
import {
  ProjectPlanService,
  type ProjectPlanService as ProjectPlanServiceType,
} from "../services/ProjectPlanService.js";

export type ProjectPlanRouteDeps = Pick<
  ProjectPlanServiceType,
  | "create"
  | "list"
  | "update"
  | "detail"
  | "delete"
  | "addTask"
  | "listTasks"
  | "reorderTask"
  | "deleteTask"
  | "hirePlan"
>;

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function createProjectPlanRoutes(service: ProjectPlanRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post("/project-plan", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const body = parseWithZod(projectPlanCreateBodySchema, req.body);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await service.create({
        user_id,
        organization_id,
        name: body.name,
        color: body.color,
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar plano de projeto", { err });
      next(err);
    }
  });

  router.get("/project-plan/list", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const { organization_id } = requireAuthenticatedRequestContext(req);
      const result = await service.list(organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar planos de projeto", { err });
      next(err);
    }
  });

  router.put("/project-plan", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const body = parseWithZod(projectPlanUpdateBodySchema, req.body);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await service.update({
        user_id,
        organization_id,
        id: body.id,
        name: body.name,
        color: body.color,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar plano de projeto", { err });
      next(err);
    }
  });

  router.get("/project-plan", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const rawObj = {
        plan_id: firstQueryValue(req.body?.plan_id ?? req.query.plan_id),
      };
      const query = parseWithZod(projectPlanDetailQuerySchema, rawObj);
      const { organization_id } = requireAuthenticatedRequestContext(req);

      const result = await service.detail(query.plan_id, organization_id);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao detalhar plano de projeto", { err });
      next(err);
    }
  });

  router.delete("/project-plan", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const rawObj = {
        id: firstQueryValue(req.body?.id ?? req.query.id),
      };
      const params = parseWithZod(projectPlanDeleteParamsSchema, rawObj);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await service.delete({
        id: params.id,
        user_id,
        organization_id,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao excluir plano de projeto", { err });
      next(err);
    }
  });

  router.post("/project-plan/task", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const body = parseWithZod(projectPlanAddTaskBodySchema, req.body);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await service.addTask({
        plan_id: body.plan_id,
        task_id: body.task_id,
        user_id,
        organization_id,
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao adicionar tarefa ao plano", { err });
      next(err);
    }
  });

  router.get(
    "/project-plan/task/list",
    isAuthenticated,
    async (req: Request, res: Response, next) => {
      try {
        const rawObj = {
          plan_id: firstQueryValue(req.body?.plan_id ?? req.query.plan_id),
        };
        const query = parseWithZod(projectPlanListTasksQuerySchema, rawObj);
        const { organization_id } = requireAuthenticatedRequestContext(req);

        const result = await service.listTasks(query.plan_id, organization_id);
        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar tarefas do plano", { err });
        next(err);
      }
    },
  );

  router.put("/project-plan/task", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const body = parseWithZod(projectPlanReorderTaskBodySchema, req.body);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await service.reorderTask({
        plan_id: body.plan_id,
        plan_task_id: body.plan_task_id,
        direction: body.direction,
        user_id,
        organization_id,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao reordenar tarefa do plano", { err });
      next(err);
    }
  });

  router.delete(
    "/project-plan/task",
    isAuthenticated,
    async (req: Request, res: Response, next) => {
      try {
        const body = parseWithZod(projectPlanDeleteTaskBodySchema, req.body);
        const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

        const result = await service.deleteTask({
          plan_id: body.plan_id,
          plan_task_id: body.plan_task_id,
          user_id,
          organization_id,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao excluir tarefa do plano", { err });
        next(err);
      }
    },
  );

  router.post("/project-plan/hire", isAuthenticated, async (req: Request, res: Response, next) => {
    try {
      const body = parseWithZod(projectPlanHireBodySchema, req.body);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await service.hirePlan({
        user_id,
        organization_id,
        project_id: body.project_id,
        plan_id: body.plan_id,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao contratar plano de projeto", { err });
      next(err);
    }
  });

  return router;
}

export const projectPlanRoutes: ReturnType<typeof Router> = createProjectPlanRoutes(
  new ProjectPlanService(),
);
