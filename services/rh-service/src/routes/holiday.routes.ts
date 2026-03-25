import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createHolidayBodySchema,
  deleteHolidayBodySchema,
  updateHolidayBodySchema,
} from "../schemas/holiday.schemas.js";
import { parseWithZod } from "../schemas/rhGeneral.schemas.js";
import { HolidayService } from "../services/holidayService.js";

const router: ReturnType<typeof Router> = Router();
const holidayService = new HolidayService();

router.post(
  "/holidays",
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

      const body = parseWithZod(createHolidayBodySchema, req.body);

      const result = await holidayService.create({
        organization_id: organizationId,
        name: body.name,
        date: body.date,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar feriado", { err });
      next(err);
    }
  },
);

router.put(
  "/holidays",
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

      const body = parseWithZod(updateHolidayBodySchema, req.body);

      const result = await holidayService.update({
        id: body.id,
        organization_id: organizationId,
        name: body.name,
        date: body.date,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar feriado", { err });
      next(err);
    }
  },
);

router.get(
  "/holidays",
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

      const result = await holidayService.list(organizationId);
      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar feriados", { err });
      next(err);
    }
  },
);

router.delete(
  "/holidays",
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

      const body = parseWithZod(deleteHolidayBodySchema, req.body);

      const result = await holidayService.delete({
        id: body.id,
        organization_id: organizationId,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao excluir feriado", { err });
      next(err);
    }
  },
);

export default router;
