import { z } from "zod";

const nameSchema = z.string().trim().min(1, "Informe o nome da configuração.").max(120);
const contractValueSchema = z
  .number()
  .finite()
  .nonnegative("O valor base do contrato não pode ser negativo.");

export const createProposalConfigBodySchema = z
  .object({
    name: nameSchema,
    contract_value: contractValueSchema,
  })
  .strict();

export const updateProposalConfigBodySchema = z
  .object({
    name: nameSchema.optional(),
    contract_value: contractValueSchema.optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.contract_value !== undefined, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const proposalConfigIdParamSchema = z
  .object({
    id: z.string().uuid("Id da configuração inválido."),
  })
  .strict();
