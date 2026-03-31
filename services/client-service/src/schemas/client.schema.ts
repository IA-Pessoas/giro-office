import { z } from "zod";

/**
 * Subconjunto do modelo `Client` (Prisma) coberto por este microserviço.
 * Campos adicionais do legado (endereço, módulos contábil/fiscal, etc.) ficam
 * para evolução ou outros endpoints.
 */
export const clientIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id do cliente inválido." }),
  })
  .strict();

/** Valores do filtro de listagem alinhados à UI (dropdown de status). */
export const clientListStatusSchema = z.enum(["Ativo", "Prospect", "Inativo"], {
  message: "status de filtro inválido.",
});

export type ClientListStatus = z.infer<typeof clientListStatusSchema>;

export type ListClientsFilters = {
  status?: ClientListStatus;
};

export const listClientsQuerySchema = z
  .object({
    organization_id: z.string().uuid({ message: "organization_id inválido." }).optional(),
    status: clientListStatusSchema.optional(),
  })
  .strict();

const baseClientFields = {
  name: z.string().min(1, "Nome é obrigatório."),
  organization_id: z.string().uuid({ message: "organization_id inválido." }),
  status: z.string().min(1, "Status é obrigatório."),
  /** Alinhado ao legado; string vazia permitida quando ainda não informado. */
  cpf_cnpj: z.string().default(""),
  company_name: z.string().nullable().optional(),
  fantasy_name: z.string().nullable().optional(),
  prospecting_status: z.string().min(1).default("Lead"),
  type: z.string().default("PJ"),
  type_registration: z.string().default("Novo"),
  /** Obrigatório no legado (`CreateRequest`); default `false` se omitido na API. */
  service_unique: z.boolean().default(false),
};

export const createClientBodySchema = z.object(baseClientFields).strict();

export const updateClientBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    cpf_cnpj: z.string().optional(),
    company_name: z.string().nullable().optional(),
    fantasy_name: z.string().nullable().optional(),
    prospecting_status: z.string().min(1).optional(),
    service_unique: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar.");

export type CreateClientBody = z.output<typeof createClientBodySchema>;
export type UpdateClientBody = z.output<typeof updateClientBodySchema>;
