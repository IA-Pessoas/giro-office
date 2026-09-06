import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const projectWizardCreateBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    name: zNonEmptyText("name"),
    start_date: z.coerce.date({ invalid_type_error: "start_date inválida." }),
    end_date: z.coerce.date({ invalid_type_error: "end_date inválida." }).optional(),
    objective: zNonEmptyText("objective"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.end_date && value.end_date < value.start_date) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data final não pode ser anterior à data inicial.",
        path: ["end_date"],
      });
    }
  });

export const idempotencyKeySchema = z
  .string({ required_error: "Idempotency-Key é obrigatória." })
  .trim()
  .min(1, "Idempotency-Key é obrigatória.")
  .max(255, "Idempotency-Key deve ter no máximo 255 caracteres.");
