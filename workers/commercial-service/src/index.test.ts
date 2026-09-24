import { expect, it, vi } from "vitest";
import worker from "./index.js";

it("falha explicitamente quando o scheduler não tem PostgreSQL configurado", () => {
  expect(() =>
    worker.scheduled(
      undefined,
      { JWT_SECRET: "secret", INTERNAL_SERVICE_TOKEN: "token" } as never,
      { waitUntil: vi.fn() },
    ),
  ).toThrow("HYPERDRIVE");
});
