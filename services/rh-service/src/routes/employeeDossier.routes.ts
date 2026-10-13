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
  getRhPermissionLevel,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  contactDeleteBodySchema,
  contactTargetBodySchema,
  contactUpdateBodySchema,
  dossierListQuerySchema,
  dossierTargetQuerySchema,
  dossierUpdateBodySchema,
  replaceAllergiesBodySchema,
} from "../schemas/employeeDossier.schemas.js";
import {
  createEmployeeMeetingMinuteBodySchema,
  employeeMeetingMinuteIdParamSchema,
  employeeMeetingMinuteQuerySchema,
  updateEmployeeMeetingMinuteBodySchema,
} from "../schemas/employeeMeetingMinute.schemas.js";
import { EmployeeDossierService } from "../services/employeeDossierService.js";
import { EmployeeMeetingMinuteService } from "../services/employeeMeetingMinuteService.js";

const router: ReturnType<typeof Router> = Router();
const employeeDossierService = new EmployeeDossierService();
const employeeMeetingMinuteService = new EmployeeMeetingMinuteService();

function getContext(request: Request) {
  const context = requireAuthenticatedRequestContext(request, { statusCode: 400 });
  return {
    actorUserId: context.user_id,
    organizationId: context.organization_id,
    rhPermission: getRhPermissionLevel(request),
  };
}

const RH_DOSSIER_MANAGER_PERMISSION = 2;

router.get(
  "/colaborator/meeting-minutes",
  isAuthenticated,
  requireRhPermission(RH_DOSSIER_MANAGER_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(employeeMeetingMinuteQuerySchema, request.query);
      const context = getContext(request);
      const data = await employeeMeetingMinuteService.list({
        ...context,
        targetUserId: query.user_id ?? context.actorUserId,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/colaborator/meeting-minutes",
  isAuthenticated,
  requireRhPermission(RH_DOSSIER_MANAGER_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createEmployeeMeetingMinuteBodySchema, request.body);
      const data = await employeeMeetingMinuteService.create(getContext(request), body);
      response.status(201).json(createSuccessResponse(data));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/colaborator/meeting-minutes/:id",
  isAuthenticated,
  requireRhPermission(RH_DOSSIER_MANAGER_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { id } = parseWithZod(employeeMeetingMinuteIdParamSchema, request.params);
      const body = parseWithZod(updateEmployeeMeetingMinuteBodySchema, request.body);
      const data = await employeeMeetingMinuteService.update(getContext(request), id, body);
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/colaborator",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(dossierTargetQuerySchema, request.query);
      const context = getContext(request);
      const data = await employeeDossierService.getDossier({
        ...context,
        targetUserId: query.user_id ?? context.actorUserId,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao buscar dossiê do colaborador", { err });
      next(err);
    }
  },
);

router.get(
  "/colaborator/list",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(dossierListQuerySchema, request.query);
      const data = await employeeDossierService.listDossiers({
        ...getContext(request),
        departmentId: query.department_id,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao listar dossiês de colaboradores", { err });
      next(err);
    }
  },
);

router.put(
  "/colaborator",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(dossierUpdateBodySchema, request.body);
      const { target_user_id: targetUserId, ...changes } = body;
      const context = getContext(request);
      const data = await employeeDossierService.updateDossier({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        changes,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao atualizar dossiê do colaborador", { err });
      next(err);
    }
  },
);

router.get(
  "/contact",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(dossierTargetQuerySchema, request.query);
      const context = getContext(request);
      const data = await employeeDossierService.listContacts({
        ...context,
        targetUserId: query.user_id ?? context.actorUserId,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao listar contatos de emergência", { err });
      next(err);
    }
  },
);

router.post(
  "/contact",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(contactTargetBodySchema, request.body);
      const { target_user_id: targetUserId, ...contact } = body;
      const context = getContext(request);
      const data = await employeeDossierService.createContact({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        contact,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao criar contato de emergência", { err });
      next(err);
    }
  },
);

router.put(
  "/contact",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(contactUpdateBodySchema, request.body);
      const { target_user_id: targetUserId, ...contact } = body;
      const context = getContext(request);
      const data = await employeeDossierService.updateContact({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        contact,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao atualizar contato de emergência", { err });
      next(err);
    }
  },
);

router.delete(
  "/contact",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(contactDeleteBodySchema, request.body);
      const { target_user_id: targetUserId, ...contact } = body;
      const context = getContext(request);
      const data = await employeeDossierService.deleteContact({
        ...context,
        targetUserId: targetUserId ?? context.actorUserId,
        contact,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao excluir contato de emergência", { err });
      next(err);
    }
  },
);

router.get(
  "/allergy",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(dossierTargetQuerySchema, request.query);
      const context = getContext(request);
      const data = await employeeDossierService.listAllergies({
        ...context,
        targetUserId: query.user_id ?? context.actorUserId,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao listar alergias do colaborador", { err });
      next(err);
    }
  },
);

router.put(
  "/allergy",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(replaceAllergiesBodySchema, request.body);
      const context = getContext(request);
      const data = await employeeDossierService.replaceAllergies({
        ...context,
        targetUserId: body.target_user_id ?? context.actorUserId,
        allergies: body.allergies,
      });
      response.status(200).json(createSuccessResponse(data));
    } catch (err) {
      logError("Erro ao atualizar alergias do colaborador", { err });
      next(err);
    }
  },
);

export default router;
