import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const local = zNonEmptyText("Local").max(200, "Local deve ter até 200 caracteres.");
const user = zNonEmptyText("Usuário").max(200, "Usuário deve ter até 200 caracteres.");
const password = zNonEmptyText("Senha").max(4_000, "Senha deve ter até 4.000 caracteres.");
const notes = z
  .string()
  .max(5_000, "Observações devem ter até 5.000 caracteres.")
  .nullable()
  .optional();

export const createMarketingPasswordBodySchema = z
  .object({
    local,
    user,
    password,
    notes,
  })
  .strict();

export const updateMarketingPasswordBodySchema = z
  .object({
    local: local.optional(),
    user: user.optional(),
    password: password.optional(),
    notes,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  });

export const marketingPasswordIdParamsSchema = z.object({
  id: z.string().uuid({ message: "ID da credencial inválido." }),
});

export const marketingPasswordConfirmationSchema = z
  .object({ confirmed: z.literal(true) })
  .strict();

export const importMarketingPasswordsBodySchema = z
  .object({
    records: z
      .array(z.unknown())
      .min(1, "Informe ao menos um registro.")
      .max(1_000, "Informe no máximo 1.000 registros por importação."),
  })
  .strict();
