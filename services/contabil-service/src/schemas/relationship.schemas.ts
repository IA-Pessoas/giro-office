import { ServiceError } from "@workspace/shared";
import { z } from "zod";

// Estados do legado; NULL é "não selecionado". Texto livre migrado continua legível,
// mas só pode ser mantido como está ou trocado por um destes estados.
export const CONTABIL_CHART_ACCOUNTS_OPTIONS = [
  "Sim",
  "Não",
  "Sim — Jonrick",
  "Não — Jonrick",
] as const;

export function assertChartAccountsState(next: string | null | undefined, current?: string | null) {
  if (next === undefined || next === null || next === current) return;
  if (!(CONTABIL_CHART_ACCOUNTS_OPTIONS as readonly string[]).includes(next)) {
    throw new ServiceError(400, "Plano de contas inválido.");
  }
}

export const createRelationshipBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    bidding: z.boolean().nullable(),
    chart_accounts: z.string().nullable(),
    tool: z.string(),
    system: z.string(),
    note: z.string(),
  })
  .strict();

export const updateRelationshipBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
    bidding: z.boolean().nullable().optional(),
    chart_accounts: z.string().nullable().optional(),
    tool: z.string().optional(),
    system: z.string().optional(),
    note: z.string().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.client_id !== undefined ||
      data.bidding !== undefined ||
      data.chart_accounts !== undefined ||
      data.tool !== undefined ||
      data.system !== undefined ||
      data.note !== undefined,
    { message: "Informe ao menos um campo para atualizar." },
  );

export const relationshipIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const relationshipClientIdParamsSchema = z
  .object({
    clientId: z.string().uuid({ message: "clientId inválido." }),
  })
  .strict();
