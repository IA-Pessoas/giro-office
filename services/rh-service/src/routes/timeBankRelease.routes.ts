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
  approveTimeBankReleaseBodySchema,
  createTimeBankReleaseBodySchema,
  listTimeBankReleasesQuerySchema,
} from "../schemas/timeBankRelease.schemas.js";
import {
  TimeBankReleaseService,
  type TimeBankReleaseListFilters,
} from "../services/timeBankReleaseService.js";

const router: ReturnType<typeof Router> = Router();
const timeBankReleaseService = new TimeBankReleaseService();

function singleQueryString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

router.get("/list", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const queryInput = {
      user_id: singleQueryString(req.query.user_id),
      is_approved: singleQueryString(req.query.is_approved),
      date_from: singleQueryString(req.query.date_from),
      date_to: singleQueryString(req.query.date_to),
    };
    const parsed = parseWithZod(listTimeBankReleasesQuerySchema, queryInput);

    const filters: TimeBankReleaseListFilters = {};
    if (parsed.user_id !== undefined) {
      filters.user_id = parsed.user_id;
    }
    if (parsed.is_approved !== undefined) {
      filters.is_approved = parsed.is_approved === "true";
    }
    if (parsed.date_from !== undefined) {
      filters.date_from = parsed.date_from;
    }
    if (parsed.date_to !== undefined) {
      filters.date_to = parsed.date_to;
    }

    const result = await timeBankReleaseService.list(organizationId, filters);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar lançamentos de banco de horas", { err });
    next(err);
  }
});

router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const body = parseWithZod(createTimeBankReleaseBodySchema, req.body);

    const result = await timeBankReleaseService.create({
      organization_id: organizationId,
      target_user_id: body.user_id,
      date: body.date,
      minutes: body.minutes,
      reason: body.reason,
      added_by_user_id: userId,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar lançamento de banco de horas", { err });
    next(err);
  }
});

router.put(
  "/approve",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      const userId = req.user_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const body = parseWithZod(approveTimeBankReleaseBodySchema, req.body);

      const result = await timeBankReleaseService.approve({
        id: body.id,
        organization_id: organizationId,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao aprovar lançamento de banco de horas", { err });
      next(err);
    }
  },
);

export default router;
