import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { OrganizationUserService } from "../services/organizationUser.service.js";

const router: Router = Router();
const organizationUserService = new OrganizationUserService();

router.post("/organization-users", isAuthenticated, organizationUserService.create);
router.get("/organization-users/:id", isAuthenticated, organizationUserService.findById);
router.get("/organization-users/organization/:organization_id", isAuthenticated, organizationUserService.findByOrganization);
router.get("/organization-users/user/:user_id", isAuthenticated, organizationUserService.findByUser);
router.patch("/organization-users/:id", isAuthenticated, organizationUserService.update);

export default router;
