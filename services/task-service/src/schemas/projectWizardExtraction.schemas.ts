import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { projectWizardProjectFields, refineProjectWizardPeriod } from "./projectWizard.schemas.js";

export const MEETING_MINUTES_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export const projectWizardExtractTasksBodySchema = z
  .object({
    content: zNonEmptyText("content").refine(
      (content) => Buffer.byteLength(content, "utf8") <= MEETING_MINUTES_MAX_SOURCE_BYTES,
      "A Ata deve ter no máximo 10 MB.",
    ),
    ...projectWizardProjectFields,
  })
  .strict()
  .superRefine(refineProjectWizardPeriod);
