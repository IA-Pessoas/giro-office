import { describe, expect, it } from "vitest";
import { createTaskAudit } from "./audit.js";
import { recordingBinding, TOKENS, workerEnv } from "./test/env.js";

const params = {
  userId: "user-1",
  organizationId: "org-1",
  permission: 2,
  action: "create",
  referring: "task.attachment",
  referringId: "task-1",
  changes: { name: "x" },
};

describe("createTaskAudit", () => {
  it("envia a mudança de entidade ao AUDIT_SERVICE com o token de auditoria", async () => {
    const audit = recordingBinding();
    await createTaskAudit(workerEnv({ AUDIT_SERVICE: audit })).createLog(params);

    const [request] = audit.calls;
    expect(new URL(request.url).pathname).toBe("/internal/audit/requests");
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
    await createTaskAudit(workerEnv({ AUDIT_SERVICE: audit })).logUpdateIfChanged({
      ...params,
      oldData: { name: "a", status: "open" },
      updatedData: { name: "b", status: "open" },
    });
    expect((await audit.calls[0].json()).changes).toEqual({ name: { from: "a", to: "b" } });
  });

  it("best-effort não derruba a operação quando o audit falha", async () => {
    const audit = recordingBinding(() => new Response("x", { status: 500 }));
    await expect(
      createTaskAudit(workerEnv({ AUDIT_SERVICE: audit })).createLog(params),
    ).resolves.toBeUndefined();
  });

  it("obrigatória falha quando o audit recusa ou não há binding", async () => {
    const audit = recordingBinding(() => new Response("x", { status: 500 }));
    await expect(
      createTaskAudit(workerEnv({ AUDIT_SERVICE: audit })).createLog({ ...params, required: true }),
    ).rejects.toThrow("Audit persistence unavailable");
    await expect(
      createTaskAudit(workerEnv()).createLog({ ...params, required: true }),
    ).rejects.toThrow("Audit persistence unavailable");
  });

  it("AUDIT_ENABLED=false não envia nada", async () => {
    const audit = recordingBinding();
    await createTaskAudit(workerEnv({ AUDIT_SERVICE: audit, AUDIT_ENABLED: "false" })).createLog(
      params,
    );
    expect(audit.calls).toHaveLength(0);
  });
});
