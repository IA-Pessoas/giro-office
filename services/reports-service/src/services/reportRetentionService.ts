import type { ReportsPrismaClient } from "../prisma/index.js";
import { DEFAULT_REPORT_RETENTION_DAYS } from "../schemas/reportRetention.schemas.js";

export class ReportRetentionService {
  constructor(private readonly prisma: ReportsPrismaClient) {}

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
  }): Promise<{ retention_days: number }> {
    const policy = await this.prisma.reportRetentionPolicy.findFirst({
      where: { organization_id: input.organizationId, report_model_id: null },
      orderBy: { updated_at: "desc" },
    });
    if (policy) {
      return this.prisma.reportRetentionPolicy.update({
        where: { id: policy.id },
        data: { retention_days: input.retentionDays },
      });
    }
    return this.prisma.reportRetentionPolicy.create({
      data: {
        organization_id: input.organizationId,
        report_model_id: null,
        retention_days: input.retentionDays,
      },
    });
  }
}
