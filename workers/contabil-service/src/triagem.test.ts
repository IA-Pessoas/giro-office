import { describe, expect, it } from "vitest";
import type { ContabilWorkerEnv } from "./env.js";
import { createTriagemOverviewClient } from "./triagem.js";

const input = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  clientId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  competence: "2026-09",
};

function client(body: unknown) {
  const env = {
    TRIAGEM_INTERNAL_TOKEN: "token",
    TRIAGEM_SERVICE: { fetch: async () => Response.json(body) },
  } as unknown as ContabilWorkerEnv;
  return createTriagemOverviewClient(env, "https://contabil.test/triagem/monthly");
}

describe("createTriagemOverviewClient", () => {
  it("trata competência ausente na Triagem como 404, não como resposta incompatível", async () => {
    await expect(
      client({ success: true, data: { items: [] } }).getSummary(input),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("mantém 502 para payload malformado", async () => {
    await expect(
      client({ success: true, data: { items: [{ client_id: "outro" }] } }).getSummary(input),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
