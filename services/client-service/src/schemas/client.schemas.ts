import { z } from "zod";

/**
 * Subconjunto do modelo `Client` (Prisma) coberto por este microserviço.
 */
export const clientIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id do cliente inválido." }),
  })
  .strict();

/**
 * Filtro de listagem: tokens da UI + literais usados na coluna `Client.status` no legado/BD.
 * `Prospect` (UI) mapeia para `Prospecção` na BD — ver `mapSimpleListStatusToDb`.
 */
export const clientListStatusSchema = z.enum(
  ["Ativo", "Inativo", "Prospect", "Prospecção", "Fechado"],
  {
    message: "status de filtro inválido.",
  },
);

export type ClientListStatus = z.infer<typeof clientListStatusSchema>;

/** Valor a usar em `where.status` no Prisma para o modo simples (sem `ref`). */
export function mapSimpleListStatusToDb(value: ClientListStatus): string {
  if (value === "Prospect") {
    return "Prospecção";
  }
  return value;
}

const LIST_STATUS_TODOS = "Todos";

const INTEGRATION_EXTRA_STATUSES = [
  "Ativo e Prospecção",
  "Ativo PJ",
  "Prospecção PJ",
  "Inativo PJ",
  "Ativo PF",
  "Prospecção PF",
  "Inativo PF",
  "Não Contradados e Paralisados",
  "Não Contradado e Paralisado",
] as const;

const DEPARTMENT_LIST_STATUSES = [
  "Departamento contabil",
  "Departamento fiscal",
  "Departamento pessoal",
  "Departamento infoproduto",
  "Departamento consultoria",
  "Departamento castelo_med",
] as const;

const simpleStatusSet = new Set<string>(clientListStatusSchema.options);
const integrationAllowedSet = new Set<string>([
  ...clientListStatusSchema.options,
  LIST_STATUS_TODOS,
  ...INTEGRATION_EXTRA_STATUSES,
]);
const depsAllowedSet = new Set<string>([LIST_STATUS_TODOS, ...DEPARTMENT_LIST_STATUSES]);

export type ListClientsFilters = {
  page: number;
  pageSize: number;
  search?: string;
  ref?: "integracao" | "deps";
  /** Valor bruto do query param `status` (incl. Prospect, Todos, filtros legados). */
  status?: string;
};

export const listClientsQuerySchema = z
  .object({
    organization_id: z.string().uuid({ message: "organization_id inválido." }).optional(),
    ref: z.enum(["integracao", "deps"]).optional(),
    status: z.string().max(120).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const st = data.status;
    if (st === undefined || st === LIST_STATUS_TODOS) {
      return;
    }
    if (!data.ref) {
      if (!simpleStatusSet.has(st)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "status de filtro inválido.",
          path: ["status"],
        });
      }
      return;
    }
    if (data.ref === "integracao") {
      if (!integrationAllowedSet.has(st)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "status de filtro inválido para ref=integracao.",
          path: ["status"],
        });
      }
      return;
    }
    if (data.ref === "deps") {
      if (!depsAllowedSet.has(st)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "status de filtro inválido para ref=deps (use Departamento … ou Todos).",
          path: ["status"],
        });
      }
    }
  });

const optionalDateTime = z.coerce.date().optional();

const extendedClientFields = {
  dominio_code: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  customer_since: optionalDateTime,
  municipal_registration: z.string().nullable().optional(),
  state_registration: z.string().nullable().optional(),
  commercial_board_registration: z.string().nullable().optional(),
  competence_entry: optionalDateTime,
  competence_output: optionalDateTime,
  opening_date: optionalDateTime,
  instagram: z.string().nullable().optional(),
  indication: z.string().nullable().optional(),
  regime: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
  start_strike: optionalDateTime,
  end_strike: optionalDateTime,
  cnae: z.string().nullable().optional(),
  cnae_secondary: z.string().nullable().optional(),
  responsible: z.string().nullable().optional(),
  cpf_responsible: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
  cpf_agent: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  contabil: z.boolean().optional(),
  fiscal: z.boolean().optional(),
  pessoal: z.boolean().optional(),
  infoproduto: z.boolean().optional(),
  consultoria: z.boolean().optional(),
  castelo_med: z.boolean().optional(),
  contract: z.boolean().optional(),
  date_status: optionalDateTime,
  description_prospecting: z.string().nullable().optional(),
  participants_meet: z.string().nullable().optional(),
  meet_type: z.string().nullable().optional(),
  register_date_prospecting: optionalDateTime,
};

const baseClientFields = {
  name: z.string().min(1, "Nome é obrigatório."),
  organization_id: z.string().uuid({ message: "organization_id inválido." }).optional(),
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
  ...extendedClientFields,
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
    type: z.string().optional(),
    type_registration: z.string().optional(),
    ...extendedClientFields,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar.");

export type CreateClientBody = z.output<typeof createClientBodySchema>;
export type UpdateClientBody = z.output<typeof updateClientBodySchema>;

/** Permissao minima de administrador no legado (`user.permission >= 2`). */
export const ADMIN_PERMISSION = 2;

export function isAdminPermission(permission?: number): boolean {
  return typeof permission === "number" && permission >= ADMIN_PERMISSION;
}
