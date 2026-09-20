import {
  COMMERCIAL_PROSPECTING_EVENT_VERSION,
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
} from "@workspace/shared";
import { z } from "zod";

const projectionStatuses = [
  "Análise Financeira",
  "Análise/Agendamento",
  "Envio de Proposta",
  "Paralisado",
  "Recusado pelo Cliente",
  "Fechado",
] as const;

export const commercialProspectingTransitionEventSchema = z
  .object({
    event_id: z.string().uuid(),
    event_type: z.literal(COMMERCIAL_PROSPECTING_TRANSITION_EVENT),
    event_version: z.literal(COMMERCIAL_PROSPECTING_EVENT_VERSION),
    organization_id: z.string().uuid(),
    client_id: z.string().uuid(),
    prospecting_id: z.string().uuid(),
    from_status: z.enum(projectionStatuses).nullable(),
    to_status: z.enum(projectionStatuses),
    status_date: z.string().datetime({ offset: true }).nullable(),
    description: z.string().nullable(),
    audit_correlation_id: z.string().trim().min(1),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type CommercialProspectingTransitionEvent = z.infer<
  typeof commercialProspectingTransitionEventSchema
>;
