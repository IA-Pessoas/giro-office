import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@workspace/shared/logger";

import { createCertificateApplication } from "./app.js";
import { getCertificateServiceEnv } from "./config/env.js";
import { createCertificatePrismaClient } from "./prisma.js";
import { createCertificateFileCrypto } from "./services/certificateFileCrypto.js";
import {
  LocalCertificateFileStorage,
  SupabaseCertificateFileStorage,
} from "./services/certificateFileStorage.js";

const env = getCertificateServiceEnv();
const logger = createLogger({
  service: "certificate-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});
const prisma = createCertificatePrismaClient(env.databaseUrl);
const certificateFileCrypto = createCertificateFileCrypto({
  keyBase64: env.certificateFileEncryptionKey,
  keyVersion: env.certificateFileEncryptionKeyVersion,
});
const certificateFileStorage =
  env.storageMode === "local"
    ? new LocalCertificateFileStorage(env.storageDir)
    : new SupabaseCertificateFileStorage(
        createClient(env.supabaseUrl, env.supabaseServiceRoleKey),
        env.storageBucket,
      );
const app = createCertificateApplication({
  env,
  logger,
  prisma,
  certificateFileStorage,
  certificateFileCrypto,
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
