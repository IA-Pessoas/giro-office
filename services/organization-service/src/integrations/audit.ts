import { randomUUID } from "node:crypto";

import { type CreateAuditRequestPayload, createAuditRecorder } from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared/logger";

import type {
  OrganizationDomainAuditEvent,
  OrganizationDomainAuditRecorder,
} from "../services/organizationService.js";

interface OrganizationAuditOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
}

export function createOrganizationAudit(
  options: OrganizationAuditOptions,
): OrganizationDomainAuditRecorder {
  const recordAudit = createAuditRecorder(options);

  return async (event: OrganizationDomainAuditEvent): Promise<void> => {
    const now = new Date().toISOString();
    const payload: CreateAuditRequestPayload = {
      requestId: randomUUID(),
      organizationId: event.organizationId,
      userId: null,
      method: "ENTITY_CHANGE",
      path: `/platform/organizations/${event.organizationId}`,
      outcome: "success",
      serviceSource: "organization-service",
      createdAt: now,
      finishedAt: now,
      metadata: { actorPlatformUserId: event.actorPlatformUserId },
      action: event.action,
      referring: "organization",
      referringId: event.organizationId,
      changes: event.changes,
    };

    await recordAudit(payload);
  };
}
