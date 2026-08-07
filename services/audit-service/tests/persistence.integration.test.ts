import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import { createAuditRequestRepository } from "../src/integrations/prisma/auditRequestRepository.js";
import { getPrismaClient } from "../src/integrations/prisma/prismaClient.js";

const enabled = process.env.AUDIT_REAL_DB_TEST === "1";
const describeRealDatabase = enabled ? describe : describe.skip;

describeRealDatabase("audit persistence in a real database", () => {
  it("persists, filters and scopes an audit event independently", async () => {
    const missing = [
      !process.env.DATABASE_URL && "DATABASE_URL",
      !process.env.AUDIT_TEST_ORGANIZATION_ID && "AUDIT_TEST_ORGANIZATION_ID",
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(
        `AUDIT_REAL_DB_TEST=1 requires: ${missing.join(", ")}. ` +
          "Use an existing organization id; the test never creates tenancy data.",
      );
    }

    const organizationId = process.env.AUDIT_TEST_ORGANIZATION_ID as string;
    const requestId = `audit-real-${randomUUID()}`;
    const referringId = process.env.AUDIT_TEST_REFERRING_ID ?? `entity-${randomUUID()}`;
    const repository = createAuditRequestRepository();
    const client = getPrismaClient();

    try {
      await repository.create({
        requestId,
        organizationId,
        method: "POST",
        path: "/admin/users",
        statusCode: 200,
        outcome: "success",
        serviceSource: "audit-service-integration-test",
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        action: "UPDATE",
        referring: "user",
        referringId,
        changes: {
          marker: requestId,
          previous: { active: false },
          next: { active: true },
        },
      });

      const filtered = await repository.search({
        organizationId,
        method: "post",
        referring: "user",
        referringId,
        page: 1,
        pageSize: 10,
      });

      expect(filtered.items).toHaveLength(1);
      expect(filtered.items[0]).toMatchObject({
        requestId,
        organizationId,
        action: "UPDATE",
        referring: "user",
        referringId,
        changes: {
          marker: requestId,
          previous: { active: false },
          next: { active: true },
        },
      });

      await expect(repository.findByRequestId(requestId, organizationId)).resolves.toMatchObject({
        requestId,
        organizationId,
      });
      await expect(repository.findByRequestId(requestId, `${organizationId}-other`)).resolves.toBe(
        null,
      );
    } finally {
      await client.auditRequest.delete({ where: { request_id: requestId } });
    }
  });
});
