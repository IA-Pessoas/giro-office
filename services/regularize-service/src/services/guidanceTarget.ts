import {
  type RegularizeGuidanceSnapshot,
  type RegularizeGuidanceTargetType,
  ServiceError,
} from "@workspace/shared";

type PrismaFindFirst = (args: {
  where: { id: string; organization_id: string };
}) => Promise<unknown>;

export type GuidanceTargetPrismaLike = {
  client?: { findFirst: PrismaFindFirst };
  clientPF?: { findFirst: PrismaFindFirst };
};

export type GuidanceTargetInput = {
  target_type: RegularizeGuidanceTargetType;
  client_pj_id?: string | null;
  client_pf_id?: string | null;
  target_snapshot?: RegularizeGuidanceSnapshot;
};

export async function resolveGuidanceTarget(
  prismaLike: GuidanceTargetPrismaLike,
  organizationId: string,
  input: GuidanceTargetInput,
): Promise<{
  targetType: RegularizeGuidanceTargetType;
  clientPjId: string | null;
  clientPfId: string | null;
  snapshot: RegularizeGuidanceSnapshot;
}> {
  if (input.target_type === "SEM_CLIENTE") {
    if (input.client_pj_id || input.client_pf_id || !isManualSnapshot(input.target_snapshot)) {
      throw new ServiceError(422, "Alvo SEM_CLIENTE inválido.");
    }
    return {
      targetType: "SEM_CLIENTE",
      clientPjId: null,
      clientPfId: null,
      snapshot: input.target_snapshot,
    };
  }

  if (input.target_type === "PJ") {
    if (!input.client_pj_id || input.client_pf_id || !prismaLike.client) {
      throw new ServiceError(422, "Alvo PJ inválido.");
    }
    const client = await prismaLike.client.findFirst({
      where: { id: input.client_pj_id, organization_id: organizationId },
    });
    if (!client) {
      throw new ServiceError(404, "Cadastro não encontrado.");
    }
    return {
      targetType: "PJ",
      clientPjId: input.client_pj_id,
      clientPfId: null,
      snapshot: createPjSnapshot(client),
    };
  }

  if (!input.client_pf_id || input.client_pj_id || !prismaLike.clientPF) {
    throw new ServiceError(422, "Alvo PF inválido.");
  }
  const clientPf = await prismaLike.clientPF.findFirst({
    where: { id: input.client_pf_id, organization_id: organizationId },
  });
  if (!clientPf) {
    throw new ServiceError(404, "Cadastro não encontrado.");
  }
  return {
    targetType: "PF",
    clientPjId: null,
    clientPfId: input.client_pf_id,
    snapshot: createPfSnapshot(clientPf),
  };
}

function isManualSnapshot(value: unknown): value is RegularizeGuidanceSnapshot {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as RegularizeGuidanceSnapshot).version === 1 &&
    (value as RegularizeGuidanceSnapshot).source === "manual" &&
    typeof (value as RegularizeGuidanceSnapshot).name === "string" &&
    Boolean((value as RegularizeGuidanceSnapshot).name?.trim())
  );
}

function createPjSnapshot(value: unknown): RegularizeGuidanceSnapshot {
  const client = value as Record<string, unknown>;
  return compactSnapshot({
    version: 1,
    source: "client_pj",
    name: stringValue(client.name),
    company_name: stringValue(client.company_name),
    trade_name: stringValue(client.fantasy_name),
    cpf_cnpj: stringValue(client.cpf_cnpj),
    document: stringValue(client.cpf_cnpj),
    address: stringValue(client.address),
    city: stringValue(client.city),
    state: stringValue(client.state),
    legal_nature: stringValue(client.legal_nature),
    share_capital: stringOrNumberValue(client.share_capital),
    regime: stringValue(client.regime),
  });
}

function createPfSnapshot(value: unknown): RegularizeGuidanceSnapshot {
  const client = value as Record<string, unknown>;
  return compactSnapshot({
    version: 1,
    source: "client_pf",
    name: stringValue(client.name),
    cpf_cnpj: stringValue(client.cpf),
    document: stringValue(client.cpf),
    address: stringValue(client.address),
    city: stringValue(client.city),
    state: stringValue(client.state),
  });
}

function compactSnapshot(snapshot: RegularizeGuidanceSnapshot): RegularizeGuidanceSnapshot {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => value !== undefined && value !== null),
  ) as RegularizeGuidanceSnapshot;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringOrNumberValue(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}
