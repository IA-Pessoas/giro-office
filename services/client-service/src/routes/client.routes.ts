import { Router, type Router as RouterType } from "express";

import type { ClientRouterDeps } from "../clientRouterDeps.js";
import { createClientCoreRouter } from "./clientCore.routes.js";
import { createClientCoringaRouter } from "./clientCoringa.routes.js";
import { createClientGroupsRouter } from "./clientGroups.routes.js";
import { createClientHistoriesRouter } from "./clientHistories.routes.js";
import { createClientIntegrationRouter } from "./clientIntegration.routes.js";
import { createClientPARouter } from "./clientPa.routes.js";
import { createClientVerticalsRouter } from "./clientVerticals.routes.js";

export function createClientRouter(deps: ClientRouterDeps): RouterType {
  const router: RouterType = Router();

  router.use(createClientIntegrationRouter(deps));
  router.use(createClientCoringaRouter(deps));
  router.use(createClientGroupsRouter(deps));
  router.use(createClientCoreRouter(deps));
  router.use(createClientPARouter(deps));
  router.use(createClientVerticalsRouter(deps));
  router.use(createClientHistoriesRouter(deps));

  return router;
}
