import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createUserApp } from "./app.js";
import { getUserServiceEnv } from "./config/env.js";
import { createUserAudit, recordImpersonationEndEvent } from "./integrations/audit.js";
import { AuthService } from "./services/authService.js";

const env = getUserServiceEnv();
const logger = createLogger({
  service: "user-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const audit = createUserAudit({
  enabled: env.auditEnabled,
  serviceUrl: env.auditServiceUrl,
  serviceToken: env.auditServiceToken,
  logger,
});

const app = createUserApp(env, logger, { audit });
const authService = new AuthService();
let impersonationExpirySweepRunning = false;

async function expireImpersonationSessions(): Promise<void> {
  if (impersonationExpirySweepRunning) {
    return;
  }
  impersonationExpirySweepRunning = true;

  try {
    const expiredCount = await authService.expireImpersonationSessions((event) =>
      recordImpersonationEndEvent(audit, event),
    );
    if (expiredCount > 0) {
      logger.info(
        { event: "auth.impersonation.expired", count: expiredCount },
        "personificações expiradas registradas",
      );
    }
  } catch (error: unknown) {
    logger.error(
      { event: "auth.impersonation.expiry.error", error },
      "falha ao expirar personificações",
    );
  } finally {
    impersonationExpirySweepRunning = false;
  }
}

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "user-service rodando");
});

const impersonationExpirySweep = setInterval(() => void expireImpersonationSessions(), 5_000);
impersonationExpirySweep.unref();
void expireImpersonationSessions();
