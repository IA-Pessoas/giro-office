import type { ReportsPrismaClient } from "../prisma/index.js";
import { DEFAULT_REPORT_RETENTION_DAYS } from "../schemas/reportRetention.schemas.js";
import type { ReportAuditService, ReportAuditStore } from "./reportAuditService.js";

type RetentionStore = {
  reportRetentionPolicy: {
    findFirst(args: {
      where: { organization_id: string; report_model_id: null };
      orderBy: { updated_at: "desc" };
    }): Promise<{ id: string; retention_days: number } | null>;
    update(args: {
      where: { id: string };
      data: { retention_days: number };
    }): Promise<{ retention_days: number }>;
    create(args: {
      data: { organization_id: string; report_model_id: null; retention_days: number };
    }): Promise<{ retention_days: number }>;
  };
};

export class ReportRetentionService {
  constructor(
    private readonly prisma: ReportsPrismaClient,
    private readonly audit: Pick<ReportAuditService, "recordRetentionChangeLocal">,
  ) {}

  async getOrganizationPolicy(input: {
    organizationId: string;
  }): Promise<{ retention_days: number }> {
    const policy = await this.prisma.reportRetentionPolicy.findFirst({
      where: { organization_id: input.organizationId, report_model_id: null },
      orderBy: { updated_at: "desc" },
    });
    return { retention_days: policy?.retention_days ?? DEFAULT_REPORT_RETENTION_DAYS };
  }

  async updateOrganizationPolicy(input: {
    organizationId: string;
    retentionDays: number;
    actorId: string;
  }): Promise<{ retention_days: number }> {
    return this.prisma.$transaction(async (transaction) => {
      const store = transaction as unknown as RetentionStore & ReportAuditStore;
      const policy = await store.reportRetentionPolicy.findFirst({
        where: { organization_id: input.organizationId, report_model_id: null },
        orderBy: { updated_at: "desc" },
      });

      const updated = policy
        ? await store.reportRetentionPolicy.update({
            where: { id: policy.id },
            data: { retention_days: input.retentionDays },
          })
        : await store.reportRetentionPolicy.create({
            data: {
              organization_id: input.organizationId,
              report_model_id: null,
              retention_days: input.retentionDays,
            },
          });

      await this.audit.recordRetentionChangeLocal(store, {
        actor_id: input.actorId,
        organization_id: input.organizationId,
        previous_retention_days: policy?.retention_days ?? DEFAULT_REPORT_RETENTION_DAYS,
        next_retention_days: updated.retention_days,
      });
      return updated;
    });
  }
}
