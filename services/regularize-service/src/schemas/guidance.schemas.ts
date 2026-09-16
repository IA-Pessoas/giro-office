import { z } from "zod";

import { guidanceWriteStatusSchema } from "./status.schemas.js";

export const guidanceEconomicActivitySchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().min(1, "code obrigatorio."),
    description: z.string().min(1, "description obrigatoria."),
    type: z.enum(["Principal", "Secundária", "Secundaria"]),
  })
  .strict();

export const guidancePartnerSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, "name obrigatorio."),
    cpf: z.string().min(1, "cpf obrigatorio."),
    role: z.string().optional(),
    share: z.coerce.number().optional(),
  })
  .strict();

export const createGuidanceBodySchema = z
  .object({
    process_id: z.string().uuid("process_id invalido."),
    type: z.string().optional(),
    request: z.string().optional(),
    framework_obs: z.string().optional(),
    legal_nature: z.string().optional(),
    company_name: z.string().optional(),
    trade_name: z.string().optional(),
    cpf_cnpj: z.string().optional(),
    share_capital: z.coerce.number().optional(),
    iptu: z.string().optional(),
    address: z.string().optional(),
    comporate_purpose: z.string().optional(),
    carryng: z.string().optional(),
    regime: z.string().optional(),
    legal_representative: z.string().optional(),
    status: guidanceWriteStatusSchema,
    economic_activities: z.array(guidanceEconomicActivitySchema).optional(),
    partners: z.array(guidancePartnerSchema).optional(),
  })
  .strict();

export const updateGuidanceBodySchema = z
  .object({
    id: z.string().uuid("id invalido."),
    type: z.string().optional(),
    request: z.string().optional(),
    framework_obs: z.string().optional(),
    legal_nature: z.string().optional(),
    company_name: z.string().optional(),
    trade_name: z.string().optional(),
    cpf_cnpj: z.string().optional(),
    share_capital: z.coerce.number().optional(),
    iptu: z.string().optional(),
    address: z.string().optional(),
    comporate_purpose: z.string().optional(),
    carryng: z.string().optional(),
    regime: z.string().optional(),
    legal_representative: z.string().optional(),
    status: guidanceWriteStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, "Informe ao menos um campo para atualizar.");

export const guidanceDetailQuerySchema = z.object({ id: z.string().uuid("id invalido.") }).strict();

export const listGuidanceByProcessQuerySchema = z
  .object({
    process_id: z.string().uuid("process_id invalido."),
  })
  .strict();

export const addGuidanceActivityBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id invalido."),
    activity: guidanceEconomicActivitySchema.omit({ id: true }),
  })
  .strict();

export const removeGuidanceActivityBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id invalido."),
    item_id: z.string().uuid("item_id invalido."),
  })
  .strict();

export const addGuidancePartnerBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id invalido."),
    partner: guidancePartnerSchema.omit({ id: true }),
  })
  .strict();

export const removeGuidancePartnerBodySchema = removeGuidanceActivityBodySchema;

export type CreateGuidanceBody = z.infer<typeof createGuidanceBodySchema>;
export type UpdateGuidanceBody = z.infer<typeof updateGuidanceBodySchema>;
export type GuidanceEconomicActivity = z.infer<typeof guidanceEconomicActivitySchema>;
export type GuidancePartner = z.infer<typeof guidancePartnerSchema>;
