import { z } from "zod";

export const createRelationshipBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    bidding: z.boolean(),
    chart_accounts: z.string(),
    tool: z.string(),
    system: z.string(),
    note: z.string(),
  })
  .strict();

export const updateRelationshipBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
    bidding: z.boolean().optional(),
    chart_accounts: z.string().optional(),
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
