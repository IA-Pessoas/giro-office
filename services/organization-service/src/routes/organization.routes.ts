import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { OrganizationService } from "../services/organization.service.js";

const router: Router = Router();
const organizationService = new OrganizationService();

router.post("/organizations", isAuthenticated, organizationService.create.bind(organizationService));
router.get("/organizations/cnpj/:cnpj", isAuthenticated, organizationService.findByCnpj.bind(organizationService));
router.patch("/organizations/cnpj/:cnpj/status", isAuthenticated, organizationService.updateStatus.bind(organizationService));
router.patch("/organizations/cnpj/:cnpj/subscription-plan", isAuthenticated, organizationService.updateSubscriptionPlan.bind(organizationService));
router.patch("/organizations/cnpj/:cnpj/logo-url", isAuthenticated, organizationService.updateLogoUrl.bind(organizationService));

export default router;
