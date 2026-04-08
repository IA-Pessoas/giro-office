import { Router } from "express";

import { createClientPfRoutes } from "./clientPf.routes.js";
import { createGuidanceRoutes } from "./guidance.routes.js";
import { createLicenseRoutes } from "./license.routes.js";
import { createMunicipalTaxesRoutes } from "./municipalTaxes.routes.js";
import { createPartnersRoutes } from "./partners.routes.js";
import { createPasswordRoutes } from "./password.routes.js";
import { createProcessRoutes } from "./process.routes.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createRegularizeRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();

  router.use(createPasswordRoutes(deps));
  router.use(createClientPfRoutes(deps));
  router.use(createPartnersRoutes(deps));
  router.use(createMunicipalTaxesRoutes(deps));
  router.use(createProcessRoutes(deps));
  router.use(createGuidanceRoutes(deps));
  router.use(createLicenseRoutes(deps));

  return router;
}
