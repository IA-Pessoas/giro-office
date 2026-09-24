import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createUserApp } from "./app.js";
import { getUserServiceEnv } from "./config/env.js";
import { createUserAudit, impersonationEndAuditParams } from "./integrations/audit.js";
import { assertUserAuditOutboxRuntime } from "./integrations/auditOutbox.js";
import prismaClient from "./prisma/index.js";
import { AuthService } from "./services/authService.js";
import { UserAuditOutboxService } from "./services/userAuditOutboxService.js";

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
const auditOutbox = new UserAuditOutboxService(prismaClient, audit, logger);
let impersonationExpirySweepRunning = false;
let auditOutboxSweepRunning = false;

async function expireImpersonationSessions(): Promise<void> {
  if (impersonationExpirySweepRunning) {
    return;
  }
  impersonationExpirySweepRunning = true;

  try {
    const expiredCount = await authService.expireImpersonationSessions(impersonationEndAuditParams);
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

async function deliverAuditOutbox(): Promise<void> {
  if (auditOutboxSweepRunning) return;
  auditOutboxSweepRunning = true;
  try {
    while (await auditOutbox.processNext()) {
      // Continue until the currently available audit records are drained.
    }
  } catch (error: unknown) {
    logger.error(
      { event: "user.audit_outbox.error", error },
      "falha ao entregar auditoria pendente",
    );
  } finally {
    auditOutboxSweepRunning = false;
  }
}

await assertUserAuditOutboxRuntime(prismaClient);

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "user-service rodando");
});

const impersonationExpirySweep = setInterval(() => void expireImpersonationSessions(), 5_000);
impersonationExpirySweep.unref();
void expireImpersonationSessions();

const auditOutboxSweep = setInterval(() => void deliverAuditOutbox(), 1_000);
auditOutboxSweep.unref();
void deliverAuditOutbox();
