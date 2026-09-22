import { createHash } from "node:crypto";

import { INTEGRACAO_PERMISSION_LEVEL, error as logError, ServiceError } from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";

export interface SettleFinanceiroRequest {
  user_id: string;
  organization_id: string;
  task_ids: string[];
  idempotency_key: string;
  integracao_level?: number;
  financeiro_level?: number;
  is_owner?: boolean;
  command_hash?: string;
}

export interface SettleFinanceiroResponse {
  task_ids: string[];
  settled: number;
}

export interface SetCollectorsRequest {
  user_id: string;
  organization_id: string;
  department_id: string;
  collector_ids: string[];
  integracao_level?: number;
  financeiro_level?: number;
  is_owner?: boolean;
}

export interface SetCollectorsResponse {
  department_id: string;
  collector_ids: string[];
}

export interface ListCollectorsRequest {
  organization_id: string;
  department_id: string;
  integracao_level?: number;
  financeiro_level?: number;
  is_owner?: boolean;
}

export interface ListFinanceiroQueueRequest {
  user_id: string;
  organization_id: string;
  department_id?: string;
  client_id?: string;
  integracao_level?: number;
  financeiro_level?: number;
  is_owner?: boolean;
}

export interface SettleExpressRequest {
  user_id: string;
  organization_id: string;
  client_id: string;
  idempotency_key: string;
  integracao_level?: number;
  financeiro_level?: number;
  is_owner?: boolean;
}

function settlementCommandHash(taskIds: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ task_ids: [...taskIds].sort() }))
    .digest("hex");
}

function expressCommandHash(clientId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ client_id: clientId }))
    .digest("hex");
}

function effectivePermission(data: {
  integracao_level?: number;
  financeiro_level?: number;
}): number {
  return Math.max(
    data.integracao_level ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
    data.financeiro_level ?? 0,
  );
}

export class TaskFinanceiroService {
  async listCollectors(data: ListCollectorsRequest) {
    const isPrivileged =
      data.is_owner === true || effectivePermission(data) === INTEGRACAO_PERMISSION_LEVEL.ADMIN;
    if (!isPrivileged) {
      throw new ServiceError(
        403,
        "Apenas administradores podem consultar a configuração de cobradores.",
      );
    }
    const collectors = await prismaClient.departmentCollector.findMany({
      where: {
        organization_id: data.organization_id,
        department_id: data.department_id,
        user: { status: "active" },
      },
      select: { user_id: true },
    });
    return collectors.map((collector) => collector.user_id);
  }

  async listQueue(data: ListFinanceiroQueueRequest) {
    if (data.is_owner !== true && effectivePermission(data) < INTEGRACAO_PERMISSION_LEVEL.VIEWER) {
      throw new ServiceError(403, "Você não possui acesso à Integração.");
    }
    const isPrivileged =
      data.is_owner === true || effectivePermission(data) === INTEGRACAO_PERMISSION_LEVEL.ADMIN;
    let departmentIds: string[] | undefined;
    if (!isPrivileged) {
      const actor = await prismaClient.user.findFirst({
        where: {
          id: data.user_id,
          status: "active",
          OR: [
            { organization_id: data.organization_id },
            { organization_id: null, department: { organization_id: data.organization_id } },
          ],
        },
        select: { department_id: true },
      });
      if (!actor) {
        throw new ServiceError(403, "Você não é cobrador ativo.");
      }
      const assignments = await prismaClient.departmentCollector.findMany({
        where: {
          organization_id: data.organization_id,
          user_id: data.user_id,
          department_id: actor.department_id,
        },
        select: { department_id: true },
      });
      departmentIds = assignments.map((assignment) => assignment.department_id);
      if (departmentIds.length === 0) {
        throw new ServiceError(403, "Você não é cobrador autorizado para nenhum departamento.");
      }
      if (data.department_id && !departmentIds.includes(data.department_id)) {
        throw new ServiceError(403, "Você não é cobrador autorizado para este departamento.");
      }
    }

    return prismaClient.task.findMany({
      where: {
        organization_id: data.organization_id,
        charge_financeiro: true,
        ...(data.department_id ? { department_id: data.department_id } : {}),
        ...(data.client_id ? { client_id: data.client_id } : {}),
        ...(departmentIds ? { department_id: { in: departmentIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        client_id: true,
        department_id: true,
        status: true,
      },
      orderBy: { date_created: "asc" },
    });
  }

  async settleExpress(data: SettleExpressRequest): Promise<SettleFinanceiroResponse> {
    if (data.is_owner !== true && effectivePermission(data) < INTEGRACAO_PERMISSION_LEVEL.VIEWER) {
      throw new ServiceError(403, "Você não possui acesso à Integração.");
    }
    const tasks = await prismaClient.task.findMany({
      where: {
        organization_id: data.organization_id,
        client_id: data.client_id,
        charge_financeiro: true,
      },
      select: { id: true },
    });
    return this.settle({
      ...data,
      task_ids: tasks.map((task) => task.id),
      command_hash: expressCommandHash(data.client_id),
    });
  }

  async setCollectors(data: SetCollectorsRequest): Promise<SetCollectorsResponse> {
    try {
      const isPrivileged =
        data.is_owner === true || effectivePermission(data) === INTEGRACAO_PERMISSION_LEVEL.ADMIN;
      if (!isPrivileged) {
        throw new ServiceError(403, "Apenas administradores podem configurar cobradores.");
      }

      const collectorIds = [...new Set(data.collector_ids)].sort();
      const response = await prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
        const department = await tx.department.findFirst({
          where: { id: data.department_id, organization_id: data.organization_id, status: "Ativo" },
          select: { id: true },
        });
        if (!department) {
          throw new ServiceError(404, "Departamento não existe ou está inativo.");
        }

        if (collectorIds.length > 0) {
          const collectors = await tx.user.findMany({
            where: {
              id: { in: collectorIds },
              department_id: data.department_id,
              status: "active",
              OR: [
                { organization_id: data.organization_id },
                { organization_id: null, department: { organization_id: data.organization_id } },
              ],
              permissions: {
                some: {
                  organization_id: data.organization_id,
                  OR: [{ integracao: { gt: 0 } }, { financeiro: { gt: 0 } }],
                },
              },
            },
            select: { id: true },
          });
          if (collectors.length !== collectorIds.length) {
            throw new ServiceError(
              422,
              "Todo cobrador deve estar ativo no departamento informado.",
            );
          }
        }

        await tx.departmentCollector.deleteMany({
          where: { organization_id: data.organization_id, department_id: data.department_id },
        });
        if (collectorIds.length > 0) {
          await tx.departmentCollector.createMany({
            data: collectorIds.map((user_id) => ({
              organization_id: data.organization_id,
              department_id: data.department_id,
              user_id,
            })),
          });
        }
        return { department_id: data.department_id, collector_ids: collectorIds };
      });

      await audit.createLog({
        userId: data.user_id,
        organizationId: data.organization_id,
        permission: effectivePermission(data),
        action: "Configuração de Cobradores Financeiros",
        referring: "integracao.financeiro.collectors",
        referringId: data.department_id,
        changes: response,
        required: true,
      });
      return response;
    } catch (err: unknown) {
      logError("Erro ao configurar cobradores financeiros", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível configurar os cobradores financeiros.", err);
    }
  }

  async settle(data: SettleFinanceiroRequest): Promise<SettleFinanceiroResponse> {
    try {
      if (
        data.is_owner !== true &&
        effectivePermission(data) < INTEGRACAO_PERMISSION_LEVEL.VIEWER
      ) {
        throw new ServiceError(403, "Você não possui acesso à Integração.");
      }
      const taskIds = [...new Set(data.task_ids)].sort();
      if (taskIds.length === 0 && !data.command_hash) {
        throw new ServiceError(400, "Informe ao menos uma tarefa para baixa.");
      }
      const commandHash = data.command_hash ?? settlementCommandHash(taskIds);
      const result = await prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
        const lockKey = JSON.stringify([data.organization_id, data.idempotency_key]);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const isPrivileged =
          data.is_owner === true || effectivePermission(data) === INTEGRACAO_PERMISSION_LEVEL.ADMIN;
        const previous = await tx.taskFinanceiroCommand.findUnique({
          where: {
            organization_id_idempotency_key: {
              organization_id: data.organization_id,
              idempotency_key: data.idempotency_key,
            },
          },
        });
        if (previous) {
          if (previous.command_hash !== commandHash) {
            throw new ServiceError(409, "Idempotency-Key já utilizada com outro comando.");
          }
          if (!isPrivileged) {
            const replay = previous.response_snapshot as unknown as SettleFinanceiroResponse;
            if (previous.requested_by_user_id !== data.user_id) {
              throw new ServiceError(403, "Você não pode repetir uma baixa de outro cobrador.");
            }
            const actor = await tx.user.findFirst({
              where: {
                id: data.user_id,
                status: "active",
                OR: [
                  { organization_id: data.organization_id },
                  { organization_id: null, department: { organization_id: data.organization_id } },
                ],
              },
              select: { department_id: true },
            });
            const replayTasks = await tx.task.findMany({
              where: { id: { in: replay.task_ids }, organization_id: data.organization_id },
              select: { id: true, department_id: true },
            });
            if (
              !actor ||
              replayTasks.length !== replay.task_ids.length ||
              replayTasks.some((task) => task.department_id !== actor.department_id)
            ) {
              throw new ServiceError(403, "Você não é cobrador autorizado para este departamento.");
            }
            const assignment = await tx.departmentCollector.findFirst({
              where: {
                organization_id: data.organization_id,
                department_id: actor.department_id,
                user_id: data.user_id,
                user: { status: "active", department_id: actor.department_id },
              },
              select: { id: true },
            });
            if (!assignment) {
              throw new ServiceError(403, "Você não é cobrador autorizado para este departamento.");
            }
          }
          // A reivindicação acontece sob o advisory lock: repetições simultâneas da
          // mesma chave não geram auditorias duplicadas.
          const claimed = await tx.taskFinanceiroCommand.updateMany({
            where: { id: previous.id, audited_at: null },
            data: { audited_at: new Date() },
          });
          return {
            response: previous.response_snapshot as unknown as SettleFinanceiroResponse,
            audit_pending: claimed.count > 0,
          };
        }
        if (taskIds.length === 0) {
          throw new ServiceError(400, "Nenhuma tarefa financeira pendente foi encontrada.");
        }

        const tasks = await tx.task.findMany({
          where: { id: { in: taskIds }, organization_id: data.organization_id },
          select: { id: true, department_id: true, charge_financeiro: true },
        });
        if (tasks.length !== taskIds.length) {
          throw new ServiceError(404, "Uma ou mais tarefas não existem.");
        }
        if (tasks.some((task) => task.charge_financeiro !== true)) {
          throw new ServiceError(
            409,
            "Uma ou mais tarefas não estão pendentes de cobrança financeira.",
          );
        }
        if (!isPrivileged) {
          const actor = await tx.user.findFirst({
            where: {
              id: data.user_id,
              status: "active",
              OR: [
                { organization_id: data.organization_id },
                { organization_id: null, department: { organization_id: data.organization_id } },
              ],
            },
            select: { department_id: true },
          });
          if (!actor) {
            throw new ServiceError(403, "Você não é cobrador ativo.");
          }
          const departmentIds = [...new Set(tasks.map((task) => task.department_id))];
          if (departmentIds.some((department_id) => department_id !== actor.department_id)) {
            throw new ServiceError(403, "Você não é cobrador autorizado para este departamento.");
          }
          const assignments = await Promise.all(
            departmentIds.map((department_id) =>
              tx.departmentCollector.findFirst({
                where: {
                  organization_id: data.organization_id,
                  department_id,
                  user_id: data.user_id,
                  user: {
                    status: "active",
                    department_id: actor.department_id,
                    OR: [
                      { organization_id: data.organization_id },
                      {
                        organization_id: null,
                        department: { organization_id: data.organization_id },
                      },
                    ],
                  },
                },
                select: { id: true },
              }),
            ),
          );
          if (assignments.some((assignment) => !assignment)) {
            throw new ServiceError(403, "Você não é cobrador autorizado para este departamento.");
          }
        }

        const response: SettleFinanceiroResponse = { task_ids: taskIds, settled: taskIds.length };
        const updated = await tx.task.updateMany({
          where: {
            id: { in: taskIds },
            organization_id: data.organization_id,
            charge_financeiro: true,
          },
          data: { charge_financeiro: false },
        });
        if (updated.count !== taskIds.length) {
          throw new ServiceError(
            409,
            "A fila financeira foi alterada; recarregue e tente novamente.",
          );
        }
        await tx.taskFinanceiroCommand.create({
          data: {
            organization_id: data.organization_id,
            requested_by_user_id: data.user_id,
            idempotency_key: data.idempotency_key,
            command_hash: commandHash,
            response_snapshot: response as unknown as Prisma.InputJsonValue,
            audited_at: new Date(),
          },
        });
        return { response, audit_pending: true };
      });
      if (result.audit_pending) {
        try {
          await audit.createLog({
            userId: data.user_id,
            organizationId: data.organization_id,
            permission: effectivePermission(data),
            action: "Baixa Financeira de Tarefas",
            referring: "integracao.financeiro.settlement",
            referringId: data.idempotency_key,
            changes: { task_ids: result.response.task_ids, settled: result.response.settled },
            required: true,
          });
        } catch (auditError: unknown) {
          // Libera a reivindicação para que uma repetição posterior audite de novo.
          await prismaClient.taskFinanceiroCommand.update({
            where: {
              organization_id_idempotency_key: {
                organization_id: data.organization_id,
                idempotency_key: data.idempotency_key,
              },
            },
            data: { audited_at: null },
          });
          throw auditError;
        }
      }
      return result.response;
    } catch (err: unknown) {
      logError("Erro ao executar baixa financeira", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível executar a baixa financeira.", err);
    }
  }
}
