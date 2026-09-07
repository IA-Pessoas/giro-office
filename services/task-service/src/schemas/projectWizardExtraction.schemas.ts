import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const projectWizardExtractTasksBodySchema = z
  .object({
    content: zNonEmptyText("content"),
    name: zNonEmptyText("name"),
    objective: zNonEmptyText("objective"),
    start_date: zIsoDate("start_date"),
    end_date: zIsoDate("end_date").optional(),
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
