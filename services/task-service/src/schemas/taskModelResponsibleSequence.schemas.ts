import { ServiceError } from "@workspace/shared";
import { z } from "zod";

const optionalResponsibleIdSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? null : value),
  z.string().trim().min(1).nullable(),
);

export const taskModelResponsibleSequenceSchema = z
  .object({
    responsible_id: z.string().trim().min(1, { message: "Responsável é obrigatório." }),
    responsible2_id: optionalResponsibleIdSchema,
    responsible3_id: optionalResponsibleIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.responsible3_id && !value.responsible2_id) {
      context.addIssue({
        code: "custom",
        path: ["responsible3_id"],
        message: "Responsável 2 é obrigatório antes do responsável 3.",
      });
    }
  });

export function parseTaskModelResponsibleSequence(value: unknown) {
  const result = taskModelResponsibleSequenceSchema.safeParse(value);

  if (!result.success) {
    throw new ServiceError(400, result.error.issues[0]?.message ?? "Dados inválidos.");
  }

  return result.data;
}
