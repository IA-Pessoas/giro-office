import { ACTIVE_MODULE_KEYS, zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const AGENDA_STATUSES = ["Pendente", "Realizado", "Cancelado"] as const;
export const INTEGRACAO_AGENDA_STATUSES = [
  "Realizado",
  "Agendada",
  "Atrasada",
  "Desmarcada pelo cliente",
  "Pendente",
  "Previsão",
] as const;

const moduleKey = z.enum(ACTIVE_MODULE_KEYS);
const optionalText = (max: number) => z.string().trim().max(max).nullish();
/** Vínculo opcional: nulo limpa; vazio é erro, não "sem vínculo". */
const optionalId = (field: string) => zNonEmptyText(field).max(64, `${field} inválido.`).nullish();
const participant = z
  .object({
    department_id: zNonEmptyText("department_id").max(64),
    participant_id: zNonEmptyText("participant_id").max(64),
  })
  .strict();
const participants = z.array(participant).min(1).max(4);
const status = z.union([z.enum(AGENDA_STATUSES), z.enum(INTEGRACAO_AGENDA_STATUSES)]);

function validateModuleEvent(
  value: {
    module: string;
    status?: string;
    participants?: unknown[];
    client_id?: string | null;
    recurrent?: boolean;
    participant_id?: string | null;
    department_id?: string;
  },
  context: z.RefinementCtx,
  creating: boolean,
) {
  if (value.module === "integracao") {
    if (creating && !value.client_id) {
      context.addIssue({ code: "custom", path: ["client_id"], message: "Cliente é obrigatório." });
    }
    if (creating && !value.participants?.length) {
      context.addIssue({
        code: "custom",
        path: ["participants"],
        message: "O primeiro departamento e responsável são obrigatórios.",
      });
    }
    if (creating && value.status && value.status !== "Pendente") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "O estado inicial deve ser Pendente.",
      });
    }
    if (
      value.status &&
      !INTEGRACAO_AGENDA_STATUSES.includes(
        value.status as (typeof INTEGRACAO_AGENDA_STATUSES)[number],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Estado inválido para Integração.",
      });
    }
    if (value.recurrent !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["recurrent"],
        message: "Recorrência não está disponível para Integração.",
      });
    }
    if ("participant_id" in value && value.participant_id !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["participant_id"],
        message: "Use pares de departamento e participante para Integração.",
      });
    }
    if (value.department_id !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["department_id"],
        message: "Use pares de departamento e participante para Integração.",
      });
    }
  } else {
    if (value.participants !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["participants"],
        message: "Participantes pertencem à agenda de Integração.",
      });
    }
    if (
      value.status &&
      !AGENDA_STATUSES.includes(value.status as (typeof AGENDA_STATUSES)[number])
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Estado inválido para este módulo.",
      });
    }
  }
}

const eventFields = {
  agenda: zNonEmptyText("agenda").max(200),
  date: zIsoDate("date"),
  status,
  obs: optionalText(2000),
  location: optionalText(200),
  client_id: optionalId("client_id"),
  participant_id: optionalId("participant_id"),
  participants: participants.optional(),
  recurrent: z.boolean(),
};

export const agendaListQuerySchema = z
  .object({
    module: moduleKey,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u, "month deve ser AAAA-MM."),
    mine: z.enum(["true", "false"]).optional(),
  })
  .strict();

export const agendaCreateBodySchema = z
  .object({
    module: moduleKey,
    department_id: zNonEmptyText("department_id").optional(),
    ...eventFields,
    status: eventFields.status.optional(),
    recurrent: eventFields.recurrent.optional(),
  })
  .strict()
  .superRefine((value, context) => validateModuleEvent(value, context, true));

export const agendaUpdateBodySchema = z
  .object({ module: moduleKey, agenda_id: zNonEmptyText("agenda_id") })
  .extend(z.object(eventFields).partial().shape)
  .strict()
  .superRefine((value, context) => validateModuleEvent(value, context, false))
  .refine(
    ({ module: _module, agenda_id: _id, ...fields }) => Object.keys(fields).length > 0,
    "Informe ao menos um campo para atualizar.",
  );

export const agendaDeleteBodySchema = z
  .object({ module: moduleKey, agenda_id: zNonEmptyText("agenda_id") })
  .strict();
