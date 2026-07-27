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

export const integracaoTaskCreateBodySchema = z
  .object({
    model_id: zNonEmptyText("model_id"),
    project_id: zNonEmptyText("project_id"),
    client_id: zNonEmptyText("client_id"),
    prospecting_status: prospectingStatusZod,
    name: z.string().optional(),
    status: integracaoTaskStatusZod.optional(),
    department_id: z.string().optional(),
    observations: z.string().optional().default(""),
    billing: taskBillingZod.optional(),
    urgency: zNonEmptyText("urgency"),
    responsible_id: z.string().optional(),
    responsible2_id: z.union([z.string(), z.null()]).optional(),
    responsible3_id: z.union([z.string(), z.null()]).optional(),
    prevision_date: z.union([z.string(), z.null(), z.date()]).optional(),
  })
  .strict();
