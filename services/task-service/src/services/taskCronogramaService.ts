import {
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import { INTEGRACAO_TASK_STATUS_IN_PROGRESS } from "../constants/integracaoTask.js";
import type prismaClient from "../prisma/index.js";

export type TaskCronogramaPrisma = Pick<typeof prismaClient, "client" | "task">;

export interface TaskCronogramaScope {
  organizationId: string;
  userId: string;
  level: IntegracaoPermissionLevel;
  isOwner: boolean;
}

export interface TaskCronogramaResult {
  client: { id: string; name: string; company_name: string | null };
  tasks: Array<{ id: string; name: string; prevision_date: string }>;
}

export class TaskCronogramaService {
  constructor(private readonly prisma: TaskCronogramaPrisma) {}

  async list(scope: TaskCronogramaScope, clientId: string): Promise<TaskCronogramaResult> {
    requireIntegracaoRouteAccess("GET", "/task/cronograma", {
      organizationId: scope.organizationId,
      userId: scope.userId,
      level: scope.level,
      isOwner: scope.isOwner,
    });

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: scope.organizationId },
      select: { id: true, name: true, company_name: true },
    });
    if (!client) throw new ServiceError(404, "Cliente não encontrado.");

    const rows = await this.prisma.task.findMany({
      where: {
        organization_id: scope.organizationId,
        client_id: clientId,
        status: { equals: INTEGRACAO_TASK_STATUS_IN_PROGRESS, mode: "insensitive" },
        prevision_date: { not: null },
      },
      select: { id: true, name: true, prevision_date: true },
      orderBy: [{ prevision_date: "asc" }, { name: "asc" }, { id: "asc" }],
    });

    return {
      client,
      tasks: rows.flatMap((row) =>
        row.prevision_date
          ? [{ id: row.id, name: row.name, prevision_date: row.prevision_date.toISOString() }]
          : [],
      ),
    };
  }
}
