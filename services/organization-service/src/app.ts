import "dotenv/config";
import { createSuccessResponse, serializeError, serviceError } from "@workspace/shared";
import { mountOpenApiDocs } from "@workspace/shared/http";
import express, { type NextFunction, type Request, type Response } from "express";
import "express-async-errors";
import cors from "cors";

import { getOrganizationEnv } from "./config/env.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildOrganizationServiceOpenApiSpec } from "./openapi/spec.js";
import organizationRoutes from "./routes/organization.routes.js";

const organizationEnv = getOrganizationEnv();

const app: express.Express = express();

app.use(cors());
app.use(express.json());
app.use(requestContext);

app.get("/health", (_request: Request, response: Response) => {
  response
    .status(200)
    .json(createSuccessResponse({ status: "ok", service: "organization-service" }));
});

if (organizationEnv.enableApiDocs) {
  mountOpenApiDocs(app, {
    spec: buildOrganizationServiceOpenApiSpec(organizationEnv),
    siteTitle: "organization-service — OpenAPI",
  });
}

app.use(organizationRoutes);

app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
  serviceError({
    service: "organization-service",
    requestId: request.requestId,
    message: error.message,
  });

  const { statusCode, body } = serializeError(error, {
    requestId: request.requestId,
    fallbackMessage: "Erro interno no organization-service.",
  });
  response.status(statusCode).json(body);
});

export { app };
