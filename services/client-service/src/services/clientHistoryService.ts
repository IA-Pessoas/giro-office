import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { HistoryFileStorage } from "./historyStorage.js";

export async function createClientHistory(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  clientId: string,
  input: { date: Date; history: string; file?: string | null; pending_id?: string },
): Promise<Record<string, unknown>> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });
  if (!client) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const create = await prisma.clientHistory.create({
    data: {
      client_id: clientId,
      date: input.date,
      history: input.history,
      file: input.file ?? null,
      user_id: userId,
      organization_id: organizationId,
    },
    select: {
      id: true,
      client_id: true,
      date: true,
      history: true,
      file: true,
      user_id: true,
    },
  });

  if (input.pending_id) {
    await prisma.clientHistoryPending.delete({
      where: { id: input.pending_id },
    });
  }

  return create as Record<string, unknown>;
}

export async function getClientHistoryDetail(
  prisma: PrismaClient,
  organizationId: string,
  historyId: string,
): Promise<Record<string, unknown> | null> {
  const detail = await prisma.clientHistory.findFirst({
    where: { id: historyId, organization_id: organizationId },
    select: {
      id: true,
      client_id: true,
      date: true,
      history: true,
      file: true,
      user_id: true,
      user: {
        select: {
          name: true,
          department: {
            select: { name: true },
          },
        },
      },
      client: {
        select: {
          company_name: true,
          cpf_cnpj: true,
        },
      },
    },
  });

  return detail as Record<string, unknown> | null;
}

export async function listClientHistories(
  prisma: PrismaClient,
  organizationId: string,
  clientId: string,
): Promise<Record<string, unknown>[]> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });
  if (!client) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const list = await prisma.clientHistory.findMany({
    where: { client_id: clientId, organization_id: organizationId },
    orderBy: { date: "asc" },
    select: {
      id: true,
      client_id: true,
      date: true,
      history: true,
      file: true,
      user_id: true,
      user: {
        select: {
          name: true,
          department: {
            select: { name: true },
          },
        },
      },
    },
  });

  return list as Record<string, unknown>[];
}

export async function updateClientHistory(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  historyId: string,
  input: { date: Date; history: string },
): Promise<Record<string, unknown>> {
  const exists = await prisma.clientHistory.findFirst({
    where: { id: historyId, organization_id: organizationId },
    select: { id: true, user_id: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Histórico não encontrado.");
  }
  if (exists.user_id !== userId) {
    throw new ServiceError(403, "Usuário não tem permissão para editar este histórico.");
  }

  const updated = await prisma.clientHistory.update({
    where: { id: historyId },
    data: {
      date: input.date,
      history: input.history,
    },
    select: {
      id: true,
      date: true,
      history: true,
      user_id: true,
    },
  });

  return updated as Record<string, unknown>;
}

export async function createHistoryPending(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  clientId: string,
  reason: string,
): Promise<Record<string, unknown>> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });
  if (!client) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const create = await prisma.clientHistoryPending.create({
    data: {
      user_id: userId,
      client_id: clientId,
      reason,
      organization_id: organizationId,
    },
    select: {
      id: true,
      user_id: true,
      client_id: true,
      reason: true,
    },
  });

  return create as Record<string, unknown>;
}

export async function listHistoryPending(
  prisma: PrismaClient,
  organizationId: string,
  filterUserId?: string,
): Promise<Record<string, unknown>[]> {
  const where = filterUserId
    ? { organization_id: organizationId, user_id: filterUserId }
    : { organization_id: organizationId };

  const list = await prisma.clientHistoryPending.findMany({
    where,
    select: {
      id: true,
      reason: true,
      client_id: true,
      client: {
        select: {
          company_name: true,
          cpf_cnpj: true,
        },
      },
    },
  });

  return list as Record<string, unknown>[];
}

export async function deleteHistoryPending(
  prisma: PrismaClient,
  organizationId: string,
  pendingId: string,
): Promise<void> {
  const exists = await prisma.clientHistoryPending.findFirst({
    where: { id: pendingId, organization_id: organizationId },
    select: { id: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Pendência não encontrada.");
  }

  await prisma.clientHistoryPending.delete({
    where: { id: pendingId },
  });
}

export async function uploadHistoryFileAndPath(
  storage: HistoryFileStorage,
  clientId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string },
): Promise<string> {
  return storage.saveObjectPath(clientId, {
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalName: file.originalname,
  });
}
