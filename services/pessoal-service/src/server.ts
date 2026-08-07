import "dotenv/config";

import { createLogger } from "@workspace/shared/logger";

import { createPessoalApp } from "./app.js";
import { getPessoalServiceEnv } from "./config/env.js";

const env = getPessoalServiceEnv();
const logger = createLogger({
  service: "pessoal-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const app = createPessoalApp({ env, logger });

app.listen(env.port, () => {
  logger.info({ event: "server.start", data: { port: env.port } }, "pessoal-service rodando");
});
