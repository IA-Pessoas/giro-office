import { createSuccessResponse, error as logError } from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { OrganizationService } from "../services/organization.service.js";

const router: ReturnType<typeof Router> = Router();
const organizationService = new OrganizationService();

router.post("/organizations", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email_created_by, cnpj } = req.body;
    const organization = await organizationService.create({ name, email_created_by, cnpj });
    res.status(201).json(createSuccessResponse(organization));
  } catch (err) {
    logError("Erro ao criar organização", { err });
    next(err);
  }
});

router.get("/organizations/:id", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organization = await organizationService.findById(req.params.id);
    res.json(createSuccessResponse(organization));
  } catch (err) {
    logError("Erro ao buscar organização", { err });
    next(err);
  }
});

router.patch(
  "/organizations/:id/status",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body;
      const updated = await organizationService.updateStatus(req.params.id, status);
      res.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar status da organização", { err });
      next(err);
    }
  },
);

router.patch(
  "/organizations/:id/subscription-plan",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subscription_plan } = req.body;
      const updated = await organizationService.updateSubscriptionPlan(req.params.id, subscription_plan);
      res.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar plano de assinatura", { err });
      next(err);
    }
  },
);

router.patch(
  "/organizations/:id/logo-url",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { logo_url } = req.body;
      const updated = await organizationService.updateLogoUrl(req.params.id, logo_url);
      res.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar logo da organização", { err });
      next(err);
    }
  },
);

export default router;
