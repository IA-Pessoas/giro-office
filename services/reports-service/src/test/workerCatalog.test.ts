import { describe, expect, it } from "vitest";

import { parseReportsServiceEnv } from "../config/env.js";
import { createWorkerSourceCatalog } from "../workerCatalog.js";

describe("createWorkerSourceCatalog", () => {
  it("autoriza férias de RH para execução assíncrona", () => {
    const catalog = createWorkerSourceCatalog(
      parseReportsServiceEnv({
        DATABASE_URL: "postgresql://reports:reports@localhost:5432/reports",
        JWT_SECRET: "test-jwt-secret",
      }),
    );

    expect(
      catalog.findAdapterForSources(["rh.holidays"], {
        organization_id: "10000000-0000-0000-0000-000000000001",
        modules: { rh: 1 },
        grant: { sources: { "rh.holidays": ["name"] }, relations: [] },
      }),
    ).toBeDefined();
  });
});
