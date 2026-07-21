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
  createTimeSheetBodySchema,
  listTimeSheetsQuerySchema,
  signTimeSheetBodySchema,
  timeSheetIdParamsSchema,
} from "../schemas/timeSheet.schemas.js";
import { TimeSheetService } from "../services/timeSheetService.js";

const router: ReturnType<typeof Router> = Router();
const timeSheetService = new TimeSheetService();

router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id e obrigatorio.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id e obrigatorio.");
    }

    const body = parseWithZod(createTimeSheetBodySchema, req.body);

    const result = await timeSheetService.create({
      organization_id: organizationId,
      user_id: body.user_id,
      start_time: body.start_time,
      end_time: body.end_time,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar folha de ponto", { err });
    next(err);
  }
});

router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const requesterId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id e obrigatorio.");
    }
    if (!requesterId) {
      throw new ServiceError(400, "user_id e obrigatorio.");
    }

    const query = parseWithZod(listTimeSheetsQuerySchema, req.query);
    const effectiveUserId = query.target_user_id ?? requesterId;

    const result = await timeSheetService.list({
      organization_id: organizationId,
      user_id: effectiveUserId,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar folhas de ponto", { err });
    next(err);
  }
});

router.get("/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id e obrigatorio.");
    }

    const { id } = parseWithZod(timeSheetIdParamsSchema, req.params);

    const result = await timeSheetService.getById({
      organization_id: organizationId,
      timesheet_id: id,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao obter detalhe da folha de ponto", { err });
    next(err);
  }
});

router.put("/sign", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const signerUserId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id e obrigatorio.");
    }
    if (!signerUserId) {
      throw new ServiceError(400, "user_id e obrigatorio.");
    }

    const body = parseWithZod(signTimeSheetBodySchema, req.body);

    const result = await timeSheetService.sign({
      organization_id: organizationId,
      timesheet_id: body.id,
      signer_user_id: signerUserId,
      signature: body.signature,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao assinar folha de ponto", { err });
    next(err);
  }
});

export default router;
