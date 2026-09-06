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

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const optionalTextZod = z.preprocess(normalizeOptionalText, z.string().optional());
const optionalStatusZod = z.preprocess(normalizeOptionalText, integracaoTaskStatusZod.optional());
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
    prospecting_status: prospectingStatusZod,
    name: optionalTextZod,
    status: optionalStatusZod,
    department_id: zNonEmptyText("department_id"),
    observations: z.string().optional().default(""),
    billing: optionalBillingZod,
    urgency: zNonEmptyText("urgency"),
    responsible_id: optionalResponsibleIdZod,
    responsible2_id: optionalResponsibleIdZod,
    responsible3_id: optionalResponsibleIdZod,
    prevision_date: optionalIsoDateZod,
  })
  .strict();
