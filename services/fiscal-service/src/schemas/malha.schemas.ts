import { z } from "zod";

import { competenceSchema } from "./competence.schemas.js";
import { paginationQuerySchema } from "./pagination.schemas.js";

export const MALHA_STATUSES = [
  "aberta",
  "em_andamento",
  "aguardando_cliente",
  "respondida",
  "encerrada",
] as const;

export type MalhaStatus = (typeof MALHA_STATUSES)[number];

const statusSchema = z.enum(MALHA_STATUSES, {
  errorMap: () => ({ message: "Situação inválida." }),
});

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Prazo inválido: use AAAA-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Prazo inválido.");

const reasonSchema = z
  .string({ required_error: "Informe o motivo." })
  .trim()
  .min(1, "Informe o motivo.")
  .max(2000, "Motivo deve ter no máximo 2000 caracteres.");

const optionalId = (message: string) => z.string().uuid(message).nullable().optional();

const periodRefine = <T extends { period_start?: string; period_end?: string }>(value: T) =>
  !value.period_start || !value.period_end || value.period_start <= value.period_end;
const periodIssue = { message: "Período inválido.", path: ["period_end"] };

export const createMalhaBodySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    period_start: competenceSchema,
    period_end: competenceSchema,
    reason: reasonSchema,
    deadline: dateSchema.nullable().optional(),
    status: statusSchema.default("aberta"),
    responsible_id: optionalId("Responsável inválido."),
    task_id: optionalId("Tarefa inválida."),
  })
  .strict()
  .refine(periodRefine, periodIssue);

export const updateMalhaBodySchema = z
  .object({
    period_start: competenceSchema.optional(),
    period_end: competenceSchema.optional(),
    reason: reasonSchema.optional(),
    deadline: dateSchema.nullable().optional(),
    status: statusSchema.optional(),
    responsible_id: optionalId("Responsável inválido."),
    task_id: optionalId("Tarefa inválida."),
  })
  .strict()
  .refine(periodRefine, periodIssue)
  .refine((value) => Object.keys(value).length > 0, { message: "Nada para alterar." });

export const malhaIdParamsSchema = z.object({ id: z.string().uuid("Malha inválida.") }).strict();

export const listMalhasQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    client_id: z.string().uuid("Cliente inválido.").optional(),
    status: statusSchema.optional(),
    responsible_id: z.string().uuid("Responsável inválido.").optional(),
  })
  .strict();

export type CreateMalhaBody = z.infer<typeof createMalhaBodySchema>;
export type UpdateMalhaBody = z.infer<typeof updateMalhaBodySchema>;
export type ListMalhasQuery = z.infer<typeof listMalhasQuerySchema>;
