import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  requireIntegracaoRouteAccess,
} from "../auth/integracao.js";
import { ServiceError } from "../http/errors.js";

export interface ProjectCrudAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
  integracaoLevel?: IntegracaoPermissionLevel;
  isOwner?: boolean;
}

export interface CreateProjectCrudRequest extends ProjectCrudAuthContext {
  name: string;
  client_id: string;
  start_date: Date;
  end_date?: Date;
  objective: string;
  sponsor_id?: string;
}

export interface ProjectCreateRow {
  id: string;
  name: string;
  client_id: string;
  status: string;
  start_date: Date | null;
  end_date: Date | null;
  objective: string | null;
  sponsor_id: string | null;
}

export const PROJECT_STATUS_WAITING_COMMERCIAL = "Aguardando liberação do Comercial";

const CREATE_SELECT = {
  id: true,
  name: true,
  client_id: true,
  status: true,
  start_date: true,
  end_date: true,
  objective: true,
  sponsor_id: true,
} as const;

/** Compatível com os TransactionClient gerados por cada serviço, sem importar seus clients. */
export interface ProjectCreationTransaction {
  client: {
    findFirst(args: {
      where: { id: string; organization_id: string };
      select: { id: true; type_registration: true; prospecting_status: true };
    }): Promise<{
      id: string;
      type_registration: string;
      prospecting_status: string;
    } | null>;
  };
  project: {
    findFirst(args: {
      where: { name: string; client_id: string; organization_id: string };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: Omit<ProjectCreateRow, "id"> & { organization_id: string; porcentage: number };
      select: typeof CREATE_SELECT;
    }): Promise<ProjectCreateRow>;
  };
}

/** O chamador controla commit/rollback e os efeitos após o commit. */
export async function createProjectInTransaction(
  data: CreateProjectCrudRequest,
  tx: ProjectCreationTransaction,
): Promise<{ create: ProjectCreateRow }> {
  requireIntegracaoRouteAccess("POST", "/project", {
    userId: data.userId,
    level: data.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
    organizationId: data.organizationId,
    resourceOrganizationId: data.organizationId,
    isOwner: data.isOwner === true,
    requestedFields: ["name", "client_id", "start_date", "end_date", "objective", "sponsor_id"],
  });

  if (data.end_date && data.end_date < data.start_date) {
    throw new ServiceError(400, "A data final não pode ser anterior à data inicial.");
  }

  const client = await tx.client.findFirst({
    where: { id: data.client_id, organization_id: data.organizationId },
    select: { id: true, type_registration: true, prospecting_status: true },
  });
  if (!client) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const duplicate = await tx.project.findFirst({
    where: {
      name: data.name,
      client_id: data.client_id,
      organization_id: data.organizationId,
    },
  });
  if (duplicate !== null) {
    throw new ServiceError(409, "Um objetivo com esse nome nesse cliente já foi cadastrada");
  }

  const create = await tx.project.create({
    data: {
      name: data.name,
      client_id: data.client_id,
      organization_id: data.organizationId,
      status:
        client.type_registration === "Novo" && client.prospecting_status !== "Fechado"
          ? PROJECT_STATUS_WAITING_COMMERCIAL
          : "Em andamento",
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      objective: data.objective,
      sponsor_id: data.sponsor_id ?? null,
      porcentage: 0,
    },
    select: CREATE_SELECT,
  });
  return { create };
}
