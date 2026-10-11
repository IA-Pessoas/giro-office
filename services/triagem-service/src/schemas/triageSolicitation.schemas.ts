import { z } from "zod";

const competenceSchema = z
  .string({ required_error: "Competência é obrigatória." })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM.");

export const createTriageSolicitationBodySchema = z
  .object({
    client_id: z.string({ required_error: "Cliente é obrigatório." }).uuid("Cliente inválido."),
    competence: competenceSchema,
    category_id: z
      .string({ required_error: "Categoria é obrigatória." })
      .uuid("Categoria inválida."),
    description: z
      .string({ required_error: "Descrição é obrigatória." })
      .trim()
      .min(1, "Descrição é obrigatória.")
      .max(2000, "A descrição deve ter no máximo 2.000 caracteres."),
    responsible_id: z
      .string({ required_error: "Responsável é obrigatório." })
      .uuid("Responsável inválido."),
  })
  .strict();

export const listTriageSolicitationQuerySchema = z
  .object({
    status: z.enum(["OPEN", "CLOSED"]).optional(),
    client_id: z.string().uuid("Cliente inválido.").optional(),
    competence: competenceSchema.optional(),
  })
  .strict();

const noteCountSchema = (label: string) =>
  z
    .number({
      required_error: `${label} é obrigatório.`,
      invalid_type_error: `${label} deve ser um número.`,
    })
    .int(`${label} deve ser inteiro.`)
    .min(0, `${label} não pode ser negativo.`)
    .max(1_000_000, `${label} deve ser no máximo 1.000.000.`);

export const updateTriageNoteCountsBodySchema = z
  .object({
    xml_inbound: noteCountSchema("XML de entrada"),
    xml_outbound: noteCountSchema("XML de saída"),
    nfse_issued: noteCountSchema("NFSE prestadas"),
    nfse_received: noteCountSchema("NFSE tomadas"),
  })
  .strict();

export const triageSolicitationIndicatorsQuerySchema = z
  .object({
    competence: competenceSchema,
    status: z.enum(["OPEN", "CLOSED"]).optional(),
  })
  .strict();

export const triageSolicitationIdParamsSchema = z
  .object({ id: z.string().uuid("Solicitação inválida.") })
  .strict();
