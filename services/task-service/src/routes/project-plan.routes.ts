import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
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
} from "../schemas/project-plan.schemas.js";
import type { ProjectPlanService } from "../services/ProjectPlanService.js";

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuario ou organizacao nao identificados.");
  }
  return { user_id, organization_id };
}

export type ProjectPlanRouteDeps = Pick<
  ProjectPlanService,
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

  router.post(
    "/integracao-plans",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectPlanCreateBodySchema, req.body);
        const { user_id, organization_id } = requireAuthContext(req);

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
    },
  );

  router.get(
    "/integracao-plans",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id } = requireAuthContext(req);
        const result = await service.list(organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar planos de projeto", { err });
        next(err);
      }
    },
  );

  router.put(
    "/integracao-plans",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectPlanUpdateBodySchema, req.body);
        const { user_id, organization_id } = requireAuthContext(req);

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
    },
  );

  router.get(
    "/integracao-plan",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = {
          plan_id: firstQueryValue(req.body?.plan_id ?? req.query.plan_id),
        };
        const query = parseWithZod(projectPlanDetailQuerySchema, rawObj);
        const { organization_id } = requireAuthContext(req);

        const result = await service.detail(query.plan_id, organization_id);
        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao detalhar plano de projeto", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/integracao-plans",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = {
          id: firstQueryValue(req.body?.id ?? req.query.id),
        };
        const params = parseWithZod(projectPlanDeleteParamsSchema, rawObj);
        const { user_id, organization_id } = requireAuthContext(req);

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
    },
  );

  router.post(
    "/integracao-plans-tasks",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectPlanAddTaskBodySchema, req.body);
        const { user_id, organization_id } = requireAuthContext(req);

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
    },
  );

  router.get(
    "/integracao-plans-tasks",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = {
          plan_id: firstQueryValue(req.body?.plan_id ?? req.query.plan_id),
        };
        const query = parseWithZod(projectPlanListTasksQuerySchema, rawObj);
        const { organization_id } = requireAuthContext(req);

        const result = await service.listTasks(query.plan_id, organization_id);
        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar tarefas do plano", { err });
        next(err);
      }
    },
  );

  router.put(
    "/integracao-plans-tasks",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectPlanReorderTaskBodySchema, req.body);
        const { organization_id } = requireAuthContext(req);

        const result = await service.reorderTask({
          plan_id: body.plan_id,
          plan_task_id: body.plan_task_id,
          direction: body.direction,
          organization_id,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao reordenar tarefa do plano", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/integracao-plans-tasks",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectPlanDeleteTaskBodySchema, req.body);
        const { organization_id } = requireAuthContext(req);

        const result = await service.deleteTask({
          plan_id: body.plan_id,
          plan_task_id: body.plan_task_id,
          organization_id,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao excluir tarefa do plano", { err });
        next(err);
      }
    },
  );

  router.post(
    "/integracao-plans-hire",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectPlanHireBodySchema, req.body);
        const { user_id, organization_id } = requireAuthContext(req);

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
    },
  );

  return router;
}
