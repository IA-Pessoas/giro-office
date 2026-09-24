import { createOrganizationWorkerApp } from "./app.js";
import type { OrganizationWorkerEnv } from "./types.js";

export { createOrganizationWorkerApp } from "./app.js";
export { OrganizationService } from "./organizationService.js";
export type { OrganizationWorkerEnv } from "./types.js";

export default {
  async fetch(request: Request, env: OrganizationWorkerEnv): Promise<Response> {
    return await createOrganizationWorkerApp({ env }).fetch(request, env);
  },
};
