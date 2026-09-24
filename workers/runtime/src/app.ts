import { Hono } from "hono";
import type { WorkerEnv } from "./env.js";

interface WorkerAppOptions {
  service: string;
}

export const createWorkerApp = ({ service }: WorkerAppOptions) => {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  app.get("/health", (c) => c.json({ status: "ok", service }));
  app.get("/ready", (c) => c.json({ status: "ready", service }));
  app.notFound((c) => c.json({ error: "Not Found" }, 404));

  return app;
};
