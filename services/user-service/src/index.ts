import "dotenv/config";

import express from "express";
import "express-async-errors";
import cors from "cors";
import type { Request, Response, NextFunction } from "express";

import { getUserServiceEnv } from "./config/env.js";
import { authRoutes } from "./routes/auth.routes.js";

const env = getUserServiceEnv();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "user-service" });
});

app.use(authRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ status: "error", message: "Internal server error." });
});

app.listen(env.port, () => {
  console.log(`user-service rodando na porta ${env.port}`);
});
