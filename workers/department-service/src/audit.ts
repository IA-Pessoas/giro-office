import type {
  DepartmentAuditCreateLogParams,
  DepartmentAuditDeps,
  DepartmentAuditUpdateParams,
} from "@workspace/department-service/src/services/departmentService.js";

import type { DepartmentWorkerEnv } from "./env.js";

const AUDIT_PATH = "/internal/audit/requests";

interface AuditPayload {
  requestId: string;
  organizationId: string | null;
  userId: string;
  permission: number | null;
  method: "ENTITY_CHANGE";
  path: string;
  outcome: "success";
  serviceSource: "department-service";
  createdAt: string;
  finishedAt: string;
  action: string;
  referring: string;
  referringId: string;
  changes: Record<string, unknown> | string;
}

async function sendAudit(env: DepartmentWorkerEnv, payload: AuditPayload): Promise<void> {
  try {
    const response = await env.AUDIT_SERVICE.fetch(
      new Request(new URL(AUDIT_PATH, "https://audit-service"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-token": env.AUDIT_SERVICE_TOKEN,
        },
        body: JSON.stringify(payload),
      }),
    );

    if (!response.ok) return;
  } catch {
    // Audit is intentionally best-effort, matching the Express recorder contract.
  }
}

function payload(
  params: DepartmentAuditCreateLogParams,
  changes: Record<string, unknown> | string,
): AuditPayload {
  const now = new Date().toISOString();
  return {
    requestId: crypto.randomUUID(),
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    permission: params.permission ?? null,
    method: "ENTITY_CHANGE",
    path: `/${params.referring.replace(/\./g, "/")}`,
    outcome: "success",
    serviceSource: "department-service",
    createdAt: now,
    finishedAt: now,
    action: params.action,
    referring: params.referring,
    referringId: params.referringId,
    changes,
  };
}

export function createDepartmentAudit(env: DepartmentWorkerEnv): DepartmentAuditDeps {
  return {
    createLog: async (params) => sendAudit(env, payload(params, params.changes)),
    logUpdateIfChanged: async (params: DepartmentAuditUpdateParams) => {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (params.oldData) {
        for (const key of Object.keys(params.updatedData)) {
          const from = params.oldData[key];
          const to = params.updatedData[key];
          if (from !== to) changes[key] = { from, to };
        }
      }

      if (Object.keys(changes).length === 0) return;

      await sendAudit(
        env,
        payload(
          {
            userId: params.userId,
            organizationId: params.organizationId,
            permission: params.permission,
            action: params.action,
            referring: params.referring,
            referringId: params.referringId,
            changes,
          },
          changes,
        ),
      );
    },
  };
}
