import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { integracaoTaskCreateBodySchema } from "./integracaoTaskCreate.schema.js";

const projectWizardTaskSchema = integracaoTaskCreateBodySchema
  .pick({
    name: true,
    department_id: true,
    model_id: true,
    prevision_date: true,
    responsible_id: true,
  })
  .extend({ name: zNonEmptyText("name") });

export const projectWizardProjectFields = {
  name: zNonEmptyText("name"),
  start_date: zIsoDate("start_date"),
  end_date: zIsoDate("end_date").optional(),
  objective: zNonEmptyText("objective"),
} as const;

export function refineProjectWizardPeriod(
  value: { start_date: Date; end_date?: Date },
  context: z.RefinementCtx,
): void {
  if (value.end_date && value.end_date < value.start_date) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A data final não pode ser anterior à data inicial.",
      path: ["end_date"],
    });
  }
}

export const projectWizardCreateBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    ...projectWizardProjectFields,
    tasks: z
      .array(projectWizardTaskSchema)
      .refine((tasks) => new Set(tasks.map((task) => task.model_id)).size === tasks.length, {
        message: "Cada Modelo pode ser usado em apenas uma tarefa do projeto.",
      })
      .default([]),
  })
  .strict()
  .superRefine(refineProjectWizardPeriod);

export const idempotencyKeySchema = z
  .string({ required_error: "Idempotency-Key é obrigatória." })
  .trim()
  .min(1, "Idempotency-Key é obrigatória.")
  .max(255, "Idempotency-Key deve ter no máximo 255 caracteres.");
