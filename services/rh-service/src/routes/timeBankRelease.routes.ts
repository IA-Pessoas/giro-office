import {
  createSuccessResponse,
  getSingleTrimmedQueryValue,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  approveTimeBankReleaseBodySchema,
  createTimeBankReleaseBodySchema,
  listTimeBankReleasesQuerySchema,
  timeBankSummaryUserParamsSchema,
} from "../schemas/timeBankRelease.schemas.js";
import {
  type TimeBankReleaseListFilters,
  TimeBankReleaseService,
} from "../services/timeBankReleaseService.js";

const router: ReturnType<typeof Router> = Router();
const timeBankReleaseService = new TimeBankReleaseService();

router.get("/summary", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
      statusCode: 400,
    });

    const result = await timeBankReleaseService.getSummary(organization_id, user_id);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao obter resumo de banco de horas", { err });
    next(err);
  }
});

router.get(
  "/summary/:userId",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
      const { userId } = parseWithZod(timeBankSummaryUserParamsSchema, req.params);

      const result = await timeBankReleaseService.getSummary(organization_id, userId);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao obter resumo de banco de horas por colaborador", { err });
      next(err);
    }
  },
);

router.get(
  "/overview",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });

      const result = await timeBankReleaseService.getOverview(organization_id);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao obter visao agregada de banco de horas", { err });
      next(err);
    }
  },
);

router.get("/list", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
    const queryInput = {
      user_id: getSingleTrimmedQueryValue(req.query.user_id),
      is_approved: getSingleTrimmedQueryValue(req.query.is_approved),
      date_from: getSingleTrimmedQueryValue(req.query.date_from),
      date_to: getSingleTrimmedQueryValue(req.query.date_to),
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

    const result = await timeBankReleaseService.list(organization_id, filters);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar lancamentos de banco de horas", { err });
    next(err);
  }
});

router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
      statusCode: 400,
    });
    const body = parseWithZod(createTimeBankReleaseBodySchema, req.body);

    const result = await timeBankReleaseService.create({
      organization_id,
      target_user_id: body.user_id,
      date: body.date,
      minutes: body.minutes,
      reason: body.reason,
      added_by_user_id: user_id,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar lancamento de banco de horas", { err });
    next(err);
  }
});

router.put("/approve", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
    const body = parseWithZod(approveTimeBankReleaseBodySchema, req.body);

    const result = await timeBankReleaseService.approve({
      id: body.id,
      organization_id,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao aprovar lancamento de banco de horas", { err });
    next(err);
  }
});

export default router;
