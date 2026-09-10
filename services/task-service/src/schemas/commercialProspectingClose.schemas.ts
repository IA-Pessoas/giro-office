import {
  COMMERCIAL_PROSPECTING_EVENT_VERSION,
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
} from "@workspace/shared";
import { z } from "zod";

const prospectingStatuses = [
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
] as const;

export const commercialProspectingCloseEventSchema = z
  .object({
    event_id: z.string().uuid(),
    event_type: z.literal(COMMERCIAL_PROSPECTING_TRANSITION_EVENT),
    event_version: z.literal(COMMERCIAL_PROSPECTING_EVENT_VERSION),
    organization_id: z.string().uuid(),
    client_id: z.string().uuid(),
    prospecting_id: z.string().uuid(),
    from_status: z.enum(prospectingStatuses).nullable(),
    to_status: z.literal("Fechado"),
    status_date: z.string().datetime({ offset: true }).nullable(),
    description: z.string().nullable(),
    audit_correlation_id: z.string().trim().min(1),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .strict();
