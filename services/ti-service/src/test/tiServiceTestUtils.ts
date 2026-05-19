import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";

import { createTiApplication } from "../app.js";
import type { TiServiceEnv } from "../config/env.js";

export function createTestApp() {
  const env = {
    nodeEnv: "test",
    port: 3040,
    databaseUrl: "postgresql://localhost/ti_service_test",
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "audit-service-token-test",
    internalServiceToken: "ti-service-internal-token-test",
    allowedOrigins: ["*"],
    enableApiDocs: false,
    logLevel: "info",
    logPretty: false,
  } satisfies TiServiceEnv;
  const logger = createLogger({
    service: "ti-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createTiApplication({
    env,
    logger,
  });
}
