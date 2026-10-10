import { randomUUID } from "node:crypto";
import type { ContingencyDraft } from "../generated/prisma/client.js";
import type { ContingencyPrisma } from "../services/contingencyService.js";

export function contingencyDatabase(organizationId = "organization-a") {
  const records = new Map<string, ContingencyDraft>();
  const client = {
    name: "Empresa Sintética",
    company_name: null as string | null,
    cpf_cnpj: "11222333000181",
    contabil: true,
  };
  const matches = (record: ContingencyDraft, where: Partial<ContingencyDraft>) =>
    Object.entries(where).every(([key, value]) => record[key as keyof ContingencyDraft] === value);
  const prisma = {
    client: {
      findFirst: async ({ where }: { where: { organization_id: string } }) =>
        where.organization_id === organizationId ? { ...client } : null,
    },
    contingencyDraft: {
      create: async ({ data }: { data: Omit<ContingencyDraft, "id" | "created_at"> }) => {
        const record = { ...data, id: randomUUID(), created_at: new Date() };
        records.set(record.id, record);
        return { ...record };
      },
      findFirst: async ({ where }: { where: Partial<ContingencyDraft> }) => {
        const record = [...records.values()].find((item) => matches(item, where));
        return record ? { ...record } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Partial<ContingencyDraft>;
        data: Partial<ContingencyDraft>;
      }) => {
        const matching = [...records.values()].filter((item) => matches(item, where));
        for (const item of matching) records.set(item.id, { ...item, ...data });
        return { count: matching.length };
      },
    },
  };
  return {
    prisma: prisma as unknown as ContingencyPrisma,
    client,
    drafts: prisma.contingencyDraft,
  };
}
