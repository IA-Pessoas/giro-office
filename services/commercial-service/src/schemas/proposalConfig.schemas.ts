import { z } from "zod";

const nameSchema = z.string().trim().min(1, "Informe o nome da configuração.").max(120);
const minimumWageSchema = z
  .number()
  .finite()
  .nonnegative("O salário mínimo não pode ser negativo.");

export const createProposalConfigBodySchema = z.object({
  name: nameSchema,
  minimum_wage: minimumWageSchema,
});

export const updateProposalConfigBodySchema = z
  .object({
    name: nameSchema.optional(),
    minimum_wage: minimumWageSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.minimum_wage !== undefined, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const proposalConfigIdParamSchema = z.object({
  id: z.string().uuid("Id da configuração inválido."),
});
