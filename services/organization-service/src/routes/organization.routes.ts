import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { OrganizationService } from "../services/organization.service.js";

const router: Router = Router();
const organizationService = new OrganizationService();

router.post("/organizations", isAuthenticated, organizationService.create);
router.get("/organizations/:id", isAuthenticated, organizationService.findById);
router.patch("/organizations/:id/status", isAuthenticated, organizationService.updateStatus);
router.patch("/organizations/:id/subscription-plan", isAuthenticated, organizationService.updateSubscriptionPlan);
router.patch("/organizations/:id/logo-url", isAuthenticated, organizationService.updateLogoUrl);

export default router;
