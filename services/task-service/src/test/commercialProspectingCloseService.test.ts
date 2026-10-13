import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { CommercialProspectingCloseService } from "../services/commercialProspectingCloseService.js";

const EVENT = {
  event_id: "10000000-0000-4000-8000-000000000001",
  event_type: "commercial.prospecting.transition" as const,
  event_version: 1 as const,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  client_id: "b0000000-0000-4000-8000-000000000001",
  prospecting_id: "c0000000-0000-4000-8000-000000000001",
  from_status: "Envio de Proposta" as const,
  to_status: "Fechado" as const,
  status_date: "2026-09-10T12:00:00.000Z",
  description: null,
  audit_correlation_id: "audit-1",
  occurred_at: "2026-09-10T12:00:00.000Z",
};

describe("CommercialProspectingCloseService", () => {
  it("reabre tarefas comerciais e devolve a competência da tarefa contratual", async () => {
    const prisma = {
      project: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      task: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "task-1",
            model_id: "model-1",
            name: "Definição de Competência",
            status: "Em andamento",
            observations: "2026-10",
            responsible_id: "user-1",
            responsible2_id: null,
            responsible3_id: null,
            department: { name: "Regularize" },
          },
          {
            id: "task-2",
            model_id: "model-2",
            name: "Entrega mensal",
            status: "Em andamento",
            observations: null,
            responsible_id: "user-2",
            responsible2_id: null,
            responsible3_id: null,
            department: { name: "Contábil" },
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      client: {
        findFirst: vi.fn().mockResolvedValue({
          id: EVENT.client_id,
          cpf_cnpj: "12345678000199",
          email: "cliente@example.com",
        }),
      },
      process: {
        findFirst: vi.fn().mockResolvedValue({ process_type: "Abertura" }),
        create: vi.fn().mockResolvedValue({ id: "new-process" }),
      },
      license: {
        findFirst: vi.fn().mockResolvedValue({
          type_license: "Sanitário",
          type: "4",
          urgency: "0",
        }),
        create: vi.fn().mockResolvedValue({ id: "new-license" }),
      },
      tasksIntegrationRegularize: {
        findMany: vi.fn().mockResolvedValue([
          { task_model_id: "model-1", referring: "process-1", referring_type: "process" },
          { task_model_id: "model-1", referring: "license-1", referring_type: "license" },
        ]),
      },
      commercialProspectingCloseEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
          ...(data as object),
          organization_id: EVENT.organization_id,
        })),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };

    const service = new CommercialProspectingCloseService(prisma as never);

    await expect(service.apply(EVENT)).resolves.toEqual({
      event_id: EVENT.event_id,
      client_id: EVENT.client_id,
      competence: "2026-10",
    });

    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: EVENT.organization_id,
        client_id: EVENT.client_id,
        status: { notIn: ["Concluída", "Em Espera", "Não Contratado", "Paralisado"] },
        billing: { not: "2" },
        taskModel: { unique_charge: false },
      },
      select: expect.objectContaining({ id: true, name: true }),
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["task-1", "task-2"] },
        organization_id: EVENT.organization_id,
        status: { not: "Em Andamento" },
      },
      data: { status: "Em Andamento" },
    });
    expect(prisma.tasksIntegrationRegularize.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: EVENT.organization_id,
        task_model_id: { in: ["model-1"] },
      },
      select: { task_model_id: true, referring: true, referring_type: true },
    });
    expect(prisma.process.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_pj_id: EVENT.client_id,
        process_type: "Abertura",
        status: "Pendente",
        observation: "2026-10",
        task_id: "task-1",
        organization_id: EVENT.organization_id,
      }),
    });
    expect(prisma.process.create).toHaveBeenCalledTimes(1);
    expect(prisma.license.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: EVENT.client_id,
        type_license: "Sanitário",
        status: "Em Andamento",
        contact: "cliente@example.com",
        task_id: "task-1",
        organization_id: EVENT.organization_id,
      }),
    });
    expect(prisma.project.updateMany).toHaveBeenCalledWith({
      where: {
        client_id: EVENT.client_id,
        organization_id: EVENT.organization_id,
        status: "Aguardando liberação do Comercial",
      },
      data: { status: "Em andamento" },
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: EVENT.organization_id,
        client_id: EVENT.client_id,
        name: { contains: "Proposta Financeira" },
        status: { not: "Concluída" },
      },
      data: { status: "Concluída" },
    });
  });

  it("não reaplica tarefas quando o evento já foi processado", async () => {
    const prisma = {
      project: { updateMany: vi.fn() },
      task: { findMany: vi.fn(), updateMany: vi.fn() },
      client: { findFirst: vi.fn() },
      process: { findFirst: vi.fn(), create: vi.fn() },
      license: { findFirst: vi.fn(), create: vi.fn() },
      tasksIntegrationRegularize: { findMany: vi.fn() },
      commercialProspectingCloseEvent: {
        findUnique: vi.fn().mockResolvedValue({
          event_id: EVENT.event_id,
          organization_id: EVENT.organization_id,
          client_id: EVENT.client_id,
          competence: "2026-10",
        }),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    };

    await expect(
      new CommercialProspectingCloseService(prisma as never).apply(EVENT),
    ).resolves.toEqual({
      event_id: EVENT.event_id,
      client_id: EVENT.client_id,
      competence: "2026-10",
    });

    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.project.updateMany).not.toHaveBeenCalled();
    expect(prisma.commercialProspectingCloseEvent.create).not.toHaveBeenCalled();
  });
});
