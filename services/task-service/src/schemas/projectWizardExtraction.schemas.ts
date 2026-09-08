import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { projectWizardProjectFields, refineProjectWizardPeriod } from "./projectWizard.schemas.js";

export const projectWizardExtractTasksBodySchema = z
  .object({
    content: zNonEmptyText("content"),
    ...projectWizardProjectFields,
  })
  .strict()
  .superRefine(refineProjectWizardPeriod);
