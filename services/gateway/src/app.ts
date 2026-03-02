import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

import { gatewayError } from "@workspace/shared";

import type { GatewayEnv } from "./config/env.js";
import { buildAuthenticateMiddleware } from "./middlewares/authenticate.js";
import { authorizeRequest } from "./middlewares/authorize.js";
import { requestContext } from "./middlewares/requestContext.js";
import { buildHttpProxyMiddleware } from "./proxy/httpProxy.js";

function createCorsOptions(env: GatewayEnv): cors.CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin não permitida pelo gateway."));
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    credentials: true
  };
}

export function createApp(env: GatewayEnv): express.Express {
  const app = express();

  app.set("trust proxy", true);
  app.use(cors(createCorsOptions(env)));
  app.options("*", cors(createCorsOptions(env)));

  app.use(requestContext);
  app.use(buildAuthenticateMiddleware(env.jwtSecret));
  app.use(authorizeRequest);

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok", service: "gateway" });
  });

  app.get("/ready", (_request, response) => {
    response.status(200).json({ status: "ready", upstream: env.legacyApiUrl });
  });

  app.use(buildHttpProxyMiddleware(env.legacyApiUrl));

  app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
    gatewayError({
      requestId: request.requestId ?? "",
      message: error.message
    });

    response.status(500).json({ error: "Erro interno no gateway." });
  });

  return app;
}
