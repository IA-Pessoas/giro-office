import { ServiceError } from "@workspace/shared";

import type { ReportCatalogScope } from "../catalog/types.js";

export interface ReportingAccessContextClient {
  getAccessContext(input: {
    userId: string;
    organizationId: string;
    requestId: string;
  }): Promise<unknown>;
}

export interface ReportingAccessContext {
  organization_id: string;
  type: "owner" | "admin" | "user" | null;
  department: { id: string } | null;
  departmentModule: string | null;
  modules: Readonly<Record<string, number>>;
}

export async function getReportingAccessContext(
  client: ReportingAccessContextClient,
  input: { userId: string; organizationId: string; requestId: string },
): Promise<ReportingAccessContext> {
  const context = await client.getAccessContext(input);
  if (typeof context !== "object" || context === null) {
    throw new ServiceError(503, "Não foi possível validar o acesso atual ao relatório.");
  }

  const value = context as {
    organization?: { id?: unknown };
    type?: unknown;
    department?: { id?: unknown };
    departmentModule?: unknown;
    modules?: unknown;
  };
  if (value.organization?.id !== input.organizationId) {
    throw new ServiceError(403, "A organização do relatório não está autorizada.");
  }
  if (typeof value.modules !== "object" || value.modules === null) {
    throw new ServiceError(503, "Não foi possível validar o acesso atual ao relatório.");
  }

  const modules = Object.fromEntries(
    Object.entries(value.modules).filter(([, permission]) => typeof permission === "number"),
  );
  return {
    organization_id: input.organizationId,
    type:
      value.type === "owner" || value.type === "admin" || value.type === "user" ? value.type : null,
    department: typeof value.department?.id === "string" ? { id: value.department.id } : null,
    departmentModule: typeof value.departmentModule === "string" ? value.departmentModule : null,
    modules,
  };
}

export async function getReportingCatalogScope(
  client: ReportingAccessContextClient,
  input: { userId: string; organizationId: string; requestId: string },
): Promise<ReportCatalogScope> {
  const context = await getReportingAccessContext(client, input);
  return { organization_id: context.organization_id, modules: context.modules };
}
