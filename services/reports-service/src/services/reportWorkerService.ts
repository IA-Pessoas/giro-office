import { ServiceError } from "@workspace/shared";

import {
  deriveReportCatalogGrant,
  deriveReportCatalogGrantFromComposition,
  type ReportCatalogScope,
} from "../catalog/types.js";
import type { ReportsPrismaClient } from "../prisma/index.js";
import type { ClaimedReportJob, ReportJobRepository } from "../prisma/reportJobRepository.js";
import {
  getReportingAccessContext,
  getReportingCatalogScope,
  type ReportingAccessContextClient,
} from "../routes/reportingContext.js";
import type { ReportComposition } from "../schemas/reportComposition.schemas.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";
import type { ReportModelDefinition } from "../schemas/reportModel.schemas.js";
import { DEFAULT_REPORT_RETENTION_DAYS } from "../schemas/reportRetention.schemas.js";
import {
  REPORT_SNAPSHOT_LIMIT_MESSAGE,
  ReportAreaExecutionError,
  type ReportExecutionService,
} from "./reportExecutionService.js";
import type { ReportLifecycleService } from "./reportLifecycleService.js";

export class ReportWorkerService {
  constructor(
    private readonly jobs: ReportJobRepository,
    private readonly prisma: ReportsPrismaClient,
    private readonly accessContext: ReportingAccessContextClient,
    private readonly execution: ReportExecutionService,
    private readonly lifecycle: ReportLifecycleService,
    private readonly leaseRenewalMs = 30_000,
  ) {}

  async processNext(): Promise<boolean> {
    const job = await this.jobs.claimNext();
    if (!job) return false;

    const leaseToken = job.lease_token ?? "";
    const renewal = setInterval(() => {
      void this.jobs.renewLease({ id: job.id, leaseToken }).catch(() => undefined);
    }, this.leaseRenewalMs);

    try {
      const { definition, scope } = await this.loadAuthorizedDefinition(job);
      const result =
        "version" in definition
          ? await this.execution.executeComposition({ definition, scope, requestId: job.id })
          : await this.execution.execute({
              definition,
              scope,
              parameterValues: this.parameterValues(job),
              requestId: job.id,
            });
      const active = await this.prisma.reportJob.findFirst({
        where: {
          id: job.id,
          status: "processing",
          lease_token: leaseToken,
          cancel_requested_at: null,
        },
      });
      if (!active) {
        await this.cancelIfRequested(job);
        return true;
      }
      const latestAuthorization = await this.loadAuthorizedDefinition(job);
      this.execution.assertAuthorizedDefinition(latestAuthorization);
      await this.lifecycle.complete({
        job_id: job.id,
        organization_id: job.organization_id,
        actor_id: job.requester_id,
        lease_token: leaseToken,
        ...("blocks" in result ? { blocks: result.blocks } : { rows: result }),
        expires_at: new Date(Date.now() + this.retentionDays(job) * 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      if (error instanceof ServiceError && error.statusCode === 409) {
        await this.cancelIfRequested(job);
        return true;
      }
      await this.fail(job, error);
    } finally {
      clearInterval(renewal);
    }
    return true;
  }

  async expireDue(): Promise<void> {
    const snapshots = await this.prisma.reportSnapshot.findMany({
      where: { expires_at: { lte: new Date() } },
      select: { organization_id: true, report_job_id: true },
      take: 100,
    });
    await Promise.allSettled(
      snapshots.map((snapshot) =>
        this.lifecycle.expire({
          job_id: snapshot.report_job_id,
          organization_id: snapshot.organization_id,
          actor_id: "system",
          reason: "retention",
        }),
      ),
    );
  }

  private async loadAuthorizedDefinition(job: ClaimedReportJob): Promise<{
    definition: ReportDefinition | ReportComposition;
    scope: ReportCatalogScope;
  }> {
    const version = await this.prisma.reportModelVersion.findFirst({
      where: { id: job.report_model_version_id, organization_id: job.organization_id },
    });
    if (!version) throw new ServiceError(404, "Versão de modelo de relatório não encontrada.");
    const model = await this.prisma.reportModel.findFirst({
      where: { id: version.report_model_id, organization_id: job.organization_id, active: true },
    });
    if (!model) throw new ServiceError(404, "Modelo de relatório não encontrado.");

    if (model.created_by_user_id === job.requester_id) {
      return {
        definition: version.definition_json as ReportModelDefinition,
        scope: await getReportingCatalogScope(this.accessContext, {
          userId: job.requester_id,
          organizationId: job.organization_id,
          requestId: job.id,
        }),
      };
    }

    const context = await getReportingAccessContext(this.accessContext, {
      userId: job.requester_id,
      organizationId: job.organization_id,
      requestId: job.id,
    });
    if (!model.department_id || context.department?.id !== model.department_id) {
      throw new ServiceError(
        403,
        "O modelo compartilhado não está mais autorizado para o solicitante.",
      );
    }
    const definition = version.definition_json as ReportModelDefinition;
    return {
      definition,
      scope: {
        organization_id: job.organization_id,
        modules: context.modules,
        grant:
          "version" in definition
            ? deriveReportCatalogGrantFromComposition(definition)
            : deriveReportCatalogGrant(definition),
      },
    };
  }

  private parameterValues(job: ClaimedReportJob): Readonly<Record<string, unknown>> {
    const payload = job.payload_json;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    const values = (payload as { parameterValues?: unknown }).parameterValues;
    return values && typeof values === "object" && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : {};
  }

  private retentionDays(job: ClaimedReportJob): number {
    const payload = job.payload_json;
    const value =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { retentionDays?: unknown }).retentionDays
        : undefined;
    return typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : DEFAULT_REPORT_RETENTION_DAYS;
  }

  private async fail(job: ClaimedReportJob, cause: unknown): Promise<void> {
    try {
      await this.lifecycle.transition({
        job_id: job.id,
        organization_id: job.organization_id,
        actor_id: job.requester_id,
        status: "failed",
        lease_token: job.lease_token ?? "",
        error_message:
          cause instanceof ReportAreaExecutionError
            ? cause.userMessage
            : cause instanceof ServiceError && cause.message === REPORT_SNAPSHOT_LIMIT_MESSAGE
              ? REPORT_SNAPSHOT_LIMIT_MESSAGE
              : "Não foi possível gerar o relatório. Confira o acesso e os critérios e tente novamente.",
      });
    } catch (error) {
      if (!(error instanceof ServiceError && error.statusCode === 409)) throw error;
    }
  }

  private async cancelIfRequested(job: ClaimedReportJob): Promise<void> {
    const current = await this.prisma.reportJob.findFirst({
      where: {
        id: job.id,
        status: "processing",
        lease_token: job.lease_token ?? "",
        cancel_requested_at: { not: null },
      },
    });
    if (!current) return;
    try {
      await this.lifecycle.transition({
        job_id: job.id,
        organization_id: job.organization_id,
        actor_id: job.requester_id,
        status: "cancelled",
        lease_token: job.lease_token ?? "",
      });
    } catch (error) {
      if (!(error instanceof ServiceError && error.statusCode === 409)) throw error;
    }
  }
}
