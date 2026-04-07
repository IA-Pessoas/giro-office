import { Router, type Router as RouterType } from "express";

import { createClientCoreRouter } from "./clientCore.routes.js";
import { createClientHistoriesRouter } from "./clientHistories.routes.js";
import { createClientIntegrationRouter } from "./clientIntegration.routes.js";
import type { ClientRouterDeps } from "./clientRouteHelpers.js";
import { createClientVerticalsRouter } from "./clientVerticals.routes.js";

export function createClientRouter(deps: ClientRouterDeps): RouterType {
  const router: RouterType = Router();

  router.use(createClientCoreRouter(deps));
  router.use(createClientIntegrationRouter(deps));
  router.use(createClientVerticalsRouter(deps));
  router.use(createClientHistoriesRouter(deps));

  return router;
}
