import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { projectWizardProjectFields, refineProjectWizardPeriod } from "./projectWizard.schemas.js";

// ponytail: teto simples de uma passada; processar Atas maiores em partes é escopo do #993.
export const MEETING_MINUTES_MAX_CHARS = 100_000;

export const projectWizardExtractTasksBodySchema = z
  .object({
    content: zNonEmptyText("content").max(
      MEETING_MINUTES_MAX_CHARS,
      `A Ata deve ter no máximo ${MEETING_MINUTES_MAX_CHARS} caracteres.`,
    ),
    ...projectWizardProjectFields,
  })
  .strict()
  .superRefine(refineProjectWizardPeriod);
