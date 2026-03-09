import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { OrganizationService } from "../services/organization.service.js";

const router: Router = Router();
const organizationService = new OrganizationService();

router.post("/organizations", isAuthenticated, organizationService.create);
router.get("/organizations/cnpj/:cnpj", isAuthenticated, organizationService.findByCnpj);
router.patch("/organizations/cnpj/:cnpj/status", isAuthenticated, organizationService.updateStatus);
router.patch("/organizations/cnpj/:cnpj/subscription-plan", isAuthenticated, organizationService.updateSubscriptionPlan);
router.patch("/organizations/cnpj/:cnpj/logo-url", isAuthenticated, organizationService.updateLogoUrl);

export default router;
