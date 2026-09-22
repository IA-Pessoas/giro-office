import { expect, it, vi } from "vitest";
import worker from "./index.js";

it("o cron da fila de relatórios falha alto sem PostgreSQL configurado", () => {
  expect(() =>
    worker.scheduled(undefined, { JWT_SECRET: "secret" } as never, { waitUntil: vi.fn() }),
  ).toThrow("HYPERDRIVE");
});

it("roteia o fetch das origens para os bindings antes de atender", async () => {
  const task = { fetch: vi.fn(async () => new Response("task")) };
  await worker.fetch(new Request("https://reports.test/health"), {
    JWT_SECRET: "secret",
    TASK_SERVICE: task,
  } as never);

  const response = await fetch("https://task-service.binding/internal/reporting/catalog");
  expect(await response.text()).toBe("task");
});
