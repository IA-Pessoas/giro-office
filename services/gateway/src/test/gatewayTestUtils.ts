import { once } from "node:events";
import type { Server } from "node:http";

import { createLogger } from "@workspace/shared";
import { MemoryLogStream } from "@workspace/shared/testUtils";

import type { GatewayEnv } from "../config/env.js";

export async function startServer(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve server address.");
  }

  return `http://127.0.0.1:${address.port}`;
}

export async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createTestLogger() {
  return createLogger({
    service: "gateway-test",
    env: "test",
    destination: new MemoryLogStream(),
  });
}

export function createTestEnv(overrides: Partial<GatewayEnv> = {}): GatewayEnv {
  return {
    nodeEnv: "test",
    enableApiDocs: true,
    authorizationMode: "enforce",
    bearerAuthCompatibility: true,
    authCookieSecure: false,
    auditEnabled: false,
    auditServiceToken: "audit-service-token",
    userServiceInternalToken: "user-service-internal-token",
    auditServiceUrl: "http://127.0.0.1:3020",
    port: 0,
    organizationServiceUrl: "http://127.0.0.1:3031",
    rhServiceUrl: "http://127.0.0.1:3034",
    userServiceUrl: "http://127.0.0.1:3030",
    departmentServiceUrl: "http://127.0.0.1:3036",
    taskServiceUrl: "http://127.0.0.1:3032",
    projectServiceUrl: "http://127.0.0.1:3033",
    clientServiceUrl: "http://127.0.0.1:3035",
    clientServiceInternalToken: "client-service-token",
    fiscalServiceUrl: "http://127.0.0.1:3037",
    contabilServiceUrl: "http://127.0.0.1:3038",
    regularizeServiceUrl: "http://127.0.0.1:3039",
    tiServiceUrl: "http://127.0.0.1:3040",
    tiServiceInternalToken: "ti-service-token",
    certificateServiceUrl: "http://127.0.0.1:3041",
    certificateServiceInternalToken: "certificate-service-token",
    pessoalServiceUrl: "http://127.0.0.1:3042",
    parcelamentoServiceUrl: "http://127.0.0.1:3043",
    reportsServiceUrl: "http://127.0.0.1:3044",
    commercialServiceUrl: "http://127.0.0.1:3045",
    databaseUrl: "postgres://test:test@127.0.0.1:5432/gateway_test",
    jwtSecret: "test-secret",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    rateLimitMax: 300,
    rateLimitWindowMs: 60_000,
    authRateLimitMax: 10,
    authRateLimitWindowMs: 60_000,
    jsonBodyLimit: "1mb",
    ...overrides,
  };
}
