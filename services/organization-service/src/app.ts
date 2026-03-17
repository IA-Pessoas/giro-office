import "dotenv/config";
import { createSuccessResponse, serializeError, serviceError } from "@workspace/shared";
import express, { type Request, type Response, type NextFunction } from "express";
import "express-async-errors";
import cors from "cors";

import { requestContext } from "./middlewares/requestContext.js";
import organizationRoutes from "./routes/organization.routes.js";

const app: express.Express = express();

app.use(cors());
app.use(express.json());
app.use(requestContext);

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).json(
    createSuccessResponse({ status: "ok", service: "organization-service" }),
  );
});

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
