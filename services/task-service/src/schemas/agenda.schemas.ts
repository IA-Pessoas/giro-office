import { ACTIVE_MODULE_KEYS, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const AGENDA_STATUSES = ["Pendente", "Realizado", "Cancelado"] as const;

const moduleKey = z.enum(ACTIVE_MODULE_KEYS);
const optionalText = (max: number) => z.string().trim().max(max).nullish();

const eventFields = {
  agenda: zNonEmptyText("agenda").max(200),
  date: z.coerce.date(),
  status: z.enum(AGENDA_STATUSES),
  obs: optionalText(2000),
  location: optionalText(200),
};

export const agendaListQuerySchema = z
  .object({
    module: moduleKey,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u, "month deve ser AAAA-MM."),
  })
  .strict();

export const agendaCreateBodySchema = z
  .object({
    module: moduleKey,
    department_id: zNonEmptyText("department_id").optional(),
    ...eventFields,
    status: eventFields.status.optional(),
  })
  .strict();

export const agendaUpdateBodySchema = z
  .object({ module: moduleKey, agenda_id: zNonEmptyText("agenda_id") })
  .extend(z.object(eventFields).partial().shape)
  .strict();

export const agendaDeleteBodySchema = z
  .object({ module: moduleKey, agenda_id: zNonEmptyText("agenda_id") })
  .strict();
