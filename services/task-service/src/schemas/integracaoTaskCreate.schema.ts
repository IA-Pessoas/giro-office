import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import {
  INTEGRACAO_TASK_STATUS_VALUES,
  type IntegracaoTaskStatus,
} from "../constants/integracaoTask.js";
import {
  PROSPECTING_STATUS_VALUES,
  type ProspectingStatus,
} from "../constants/prospectingStatus.js";
import { isIsoCalendarDate } from "../utils/civilDate.js";

const prospectingStatusZod = z.enum(
  PROSPECTING_STATUS_VALUES as unknown as [ProspectingStatus, ...ProspectingStatus[]],
);

const integracaoTaskStatusZod = z.enum(
  INTEGRACAO_TASK_STATUS_VALUES as unknown as [IntegracaoTaskStatus, ...IntegracaoTaskStatus[]],
);

const taskBillingZod = z.enum(["Realizar", "Não Realizar"]);

function normalizeOptionalText(value: unknown): unknown {
  return typeof value === "string" && !value.trim() ? undefined : value;
}

const optionalTextZod = z.preprocess(normalizeOptionalText, z.string().optional());
const optionalStatusZod = z.preprocess(normalizeOptionalText, integracaoTaskStatusZod.optional());
const optionalProspectingStatusZod = z.preprocess(
  normalizeOptionalText,
  prospectingStatusZod.optional(),
);
const optionalBillingZod = z.preprocess(normalizeOptionalText, taskBillingZod.optional());
const optionalResponsibleIdZod = z.preprocess(
  normalizeOptionalText,
  z.union([z.string(), z.null()]).optional(),
);
const optionalIsoDateZod = z.preprocess(
  normalizeOptionalText,
  z
    .string()
    .refine(isIsoCalendarDate, "prevision_date deve ser uma data YYYY-MM-DD válida.")
    .optional(),
);

export const integracaoTaskCreateBodySchema = z
  .object({
    model_id: zNonEmptyText("model_id"),
    project_id: zNonEmptyText("project_id"),
    client_id: zNonEmptyText("client_id"),
    prospecting_status: optionalProspectingStatusZod,
    name: optionalTextZod,
    status: optionalStatusZod,
    department_id: zNonEmptyText("department_id"),
    observations: z.string().optional().default(""),
    billing: optionalBillingZod,
    urgency: zNonEmptyText("urgency"),
    responsible_id: optionalResponsibleIdZod,
    prevision_date: optionalIsoDateZod,
  })
  .strict();
