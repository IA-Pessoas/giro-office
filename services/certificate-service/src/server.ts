import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createCertificateApplication } from "./app.js";
import { getCertificateServiceEnv } from "./config/env.js";
import { createCertificatePrismaClient } from "./prisma.js";

const env = getCertificateServiceEnv();
const logger = createLogger({
  service: "certificate-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createCertificatePrismaClient(env.databaseUrl);
const app = createCertificateApplication({
  env,
  logger,
  prisma,
});

app.listen(env.port, () => {
  logger.info(
    {
      event: "server.start",
      data: { port: env.port },
    },
    "certificate-service rodando",
  );
});
