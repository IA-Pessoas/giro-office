import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import {
  PROSPECTING_STATUS_VALUES,
  type ProspectingStatus,
} from "../constants/prospecting-status.js";

const prospectingStatusZod = z.enum(
  PROSPECTING_STATUS_VALUES as unknown as [ProspectingStatus, ...ProspectingStatus[]],
);

export const integracaoTaskCreateBodySchema = z
  .object({
    model_id: zNonEmptyText("model_id"),
    project_id: zNonEmptyText("project_id"),
    client_id: zNonEmptyText("client_id"),
    prospecting_status: prospectingStatusZod,
    observations: z.string(),
    urgency: zNonEmptyText("urgency"),
  })
  .strict();
