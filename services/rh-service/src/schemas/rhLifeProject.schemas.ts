import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const uuid = z.string().uuid("id inválido.");

export const rhLifeProjectQuerySchema = z
  .object({
    year: z.coerce.number().int().min(1900).max(9999),
    user_id: uuid.optional(),
  })
  .strict();

export const createRhLifeProjectBodySchema = z
  .object({
    year: z.number().int().min(1900).max(9999),
    target_user_id: uuid.optional(),
  })
  .strict();

export const rhLifeProjectIdParamSchema = z.object({ id: uuid }).strict();

export const updateRhLifeProjectBodySchema = z
  .object({
    life_story: z.string().trim().max(10000).optional(),
    company_story: z.string().trim().max(10000).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Informe ao menos uma história para atualizar.",
  });

export const createRhLifeObjectiveBodySchema = z
  .object({
    title: zNonEmptyText("title"),
    forecast_date: zIsoDate("forecast_date").nullable().optional(),
    employee_observations: z.string().trim().max(5000).optional(),
  })
  .strict();

export const rhLifeObjectiveParamsSchema = z.object({ id: uuid, objectiveId: uuid }).strict();

export const updateRhLifeObjectiveBodySchema = z
  .object({
    title: zNonEmptyText("title").optional(),
    forecast_date: zIsoDate("forecast_date").nullable().optional(),
    completed_at: zIsoDate("completed_at").nullable().optional(),
    status: z.enum(["ToDo", "Realized", "Discontinued"]).optional(),
    rh_observations: z.string().trim().max(5000).optional(),
    employee_observations: z.string().trim().max(5000).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Informe ao menos um campo para atualizar o objetivo.",
  });

export type CreateRhLifeProjectBody = z.infer<typeof createRhLifeProjectBodySchema>;
export type UpdateRhLifeProjectBody = z.infer<typeof updateRhLifeProjectBodySchema>;
export type CreateRhLifeObjectiveBody = z.infer<typeof createRhLifeObjectiveBodySchema>;
export type UpdateRhLifeObjectiveBody = z.infer<typeof updateRhLifeObjectiveBodySchema>;
