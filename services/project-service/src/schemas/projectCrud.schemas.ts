import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const projectIdSchema = z.string().uuid({ message: "project_id inválido." });

function zQueryString(fieldName: string) {
  return z.preprocess(
    (v) => (Array.isArray(v) ? v[0] : v),
    z.string().min(1, `${fieldName} é obrigatório.`),
  );
}

const optionalSponsorId = z
  .union([z.string().uuid({ message: "sponsor_id inválido." }), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? undefined : v));

export const integracaoProjectCreateBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    client_id: z.string().uuid({ message: "client_id inválido." }),
    start_date: z.coerce.date({ invalid_type_error: "start_date inválida." }),
    objective: z.string(),
    sponsor_id: optionalSponsorId,
  })
  .strict();

export const integracaoProjectUpdateBodySchema = z
  .object({
    project_id: projectIdSchema,
    name: zNonEmptyText("name"),
    start_date: z.coerce.date({ invalid_type_error: "start_date inválida." }),
    end_date: z.coerce.date({ invalid_type_error: "end_date inválida." }),
    objective: z.string(),
    sponsor_id: optionalSponsorId,
  })
  .strict();

export const integracaoProjectListQuerySchema = z
  .object({
    ref: z.enum(["client", "status", "sponsor"], {
      errorMap: () => ({ message: "ref deve ser client, status ou sponsor." }),
    }),
    id: zQueryString("id"),
  })
  .strict();

export const integracaoProjectDetailQuerySchema = z
  .object({
    project_id: projectIdSchema,
  })
  .strict();

export const integracaoProjectDeleteParamsSchema = z
  .object({
    project_id: projectIdSchema,
  })
  .strict();
