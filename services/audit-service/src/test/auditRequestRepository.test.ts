import type { CreateAuditRequestPayload } from "@workspace/shared/audit";
import { describe, expect, it, vi } from "vitest";

import { createAuditRequestRepository } from "../integrations/prisma/auditRequestRepository.js";

const payload: CreateAuditRequestPayload = {
  requestId: "audit-request-1",
  organizationId: "organization-1",
  userId: "user-1",
  method: "ENTITY_CHANGE",
  path: "/pessoal/group-assignments/apply",
  outcome: "success",
  serviceSource: "pessoal-service",
  createdAt: "2026-09-16T00:00:00.000Z",
};

describe("AuditRequestRepository", () => {
  it("preserva a primeira auditoria quando recebe o mesmo request id novamente", async () => {
    const upsert = vi.fn(async () => ({}));
    const repository = createAuditRequestRepository({ auditRequest: { upsert } } as never);

    await repository.create(payload);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { request_id: payload.requestId },
        update: {},
        create: expect.objectContaining({ request_id: payload.requestId }),
      }),
    );
  });
});
