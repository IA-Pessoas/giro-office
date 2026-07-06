import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const passwordIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const listPasswordsQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }),
  })
  .strict();

const optionalSecret = (fieldName: string) =>
  z.string().trim().min(1, `${fieldName} e obrigatorio.`).nullable().optional();

const optionalResponsibleId = z
  .string()
  .uuid({ message: "responsavel_id invalido." })
  .nullable()
  .optional();

export const createPasswordBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }),
    service_name: zNonEmptyText("service_name"),
    login_main: optionalSecret("login_main"),
    senha_main: optionalSecret("senha_main"),
    login_secondary: optionalSecret("login_secondary"),
    senha_secondary: optionalSecret("senha_secondary"),
    responsavel_id: optionalResponsibleId,
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updatePasswordBodySchema = createPasswordBodySchema
  .omit({ client_id: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type ListPasswordsQuery = z.infer<typeof listPasswordsQuerySchema>;
export type CreatePasswordBody = z.infer<typeof createPasswordBodySchema>;
export type UpdatePasswordBody = z.infer<typeof updatePasswordBodySchema>;
