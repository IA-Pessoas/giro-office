import type { OpenApiDocument } from "@workspace/shared/http";

import type { CertificateServiceEnv } from "../config/env.js";

export function buildCertificateServiceOpenApiSpec(env: CertificateServiceEnv): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "certificate-service",
      version: "1.0.0",
      description: "API do microservico de certificados.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    paths: {
      "/health": {
        get: {
          operationId: "getCertificateServiceHealth",
          tags: ["Infra"],
          summary: "Health check do certificate-service",
          responses: {
            "200": {
              description: "Servico disponivel",
            },
          },
        },
      },
      "/ready": {
        get: {
          operationId: "getCertificateServiceReadiness",
          tags: ["Infra"],
          summary: "Readiness check do certificate-service",
          responses: {
            "200": {
              description: "Servico pronto",
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        internalToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
        },
      },
    },
  };
}
