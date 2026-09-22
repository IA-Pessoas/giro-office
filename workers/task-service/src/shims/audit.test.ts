import { describe, expect, it } from "vitest";
import { runInTaskContext } from "../context.js";
import { recordingBinding, TOKENS, workerEnv } from "../test/env.js";
import { createLog, logUpdateIfChanged } from "./audit.js";

const inContext = <T>(env: ReturnType<typeof workerEnv>, fn: () => Promise<T>) =>
  runInTaskContext({ env, createPrisma: () => ({ $disconnect: async () => {} }) }, fn);

const params = {
  userId: "user-1",
  organizationId: "org-1",
  permission: 2,
  action: "create",
  referring: "task.attachment",
  referringId: "task-1",
  changes: { name: "x" },
};

describe("audit shim", () => {
  it("envia a mudança de entidade ao AUDIT_SERVICE com o token de auditoria", async () => {
    const audit = recordingBinding();
    await inContext(workerEnv({ AUDIT_SERVICE: audit }), () => createLog(params));

    expect(audit.calls).toHaveLength(1);
    const [request] = audit.calls;
    expect(new URL(request.url).pathname).toBe("/internal/audit/requests");
    expect(request.method).toBe("POST");
    expect(request.headers.get("x-internal-service-token")).toBe(TOKENS.audit);
    expect(await request.json()).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      permission: 2,
      method: "ENTITY_CHANGE",
      path: "/task/attachment",
      outcome: "success",
      serviceSource: "task-service",
      action: "create",
      referring: "task.attachment",
      referringId: "task-1",
      changes: { name: "x" },
    });
  });

  it("registra só os campos alterados no update", async () => {
    const audit = recordingBinding();
    await inContext(workerEnv({ AUDIT_SERVICE: audit }), () =>
      logUpdateIfChanged({
        ...params,
        oldData: { name: "a", status: "open" },
        updatedData: { name: "b", status: "open" },
      }),
    );
    expect((await audit.calls[0].json()).changes).toEqual({ name: { from: "a", to: "b" } });
  });

  it("auditoria best-effort não derruba a operação quando o audit falha", async () => {
    const audit = recordingBinding(() => new Response("x", { status: 500 }));
    await expect(
      inContext(workerEnv({ AUDIT_SERVICE: audit }), () => createLog(params)),
    ).resolves.toBeUndefined();
  });

  it("auditoria obrigatória falha quando o audit recusa", async () => {
    const audit = recordingBinding(() => new Response("x", { status: 500 }));
    await expect(
      inContext(workerEnv({ AUDIT_SERVICE: audit }), () =>
        createLog({ ...params, required: true }),
      ),
    ).rejects.toThrow();
  });

  it("auditoria obrigatória falha sem o binding", async () => {
    await expect(
      inContext(workerEnv(), () => createLog({ ...params, required: true })),
    ).rejects.toThrow();
  });

  it("AUDIT_ENABLED=false não envia nada", async () => {
    const audit = recordingBinding();
    await inContext(workerEnv({ AUDIT_SERVICE: audit, AUDIT_ENABLED: "false" }), () =>
      createLog(params),
    );
    expect(audit.calls).toHaveLength(0);
  });
});
