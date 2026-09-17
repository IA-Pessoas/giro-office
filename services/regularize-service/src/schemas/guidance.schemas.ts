import {
  REGULARIZE_GUIDANCE_CHECKLIST_CODES,
  REGULARIZE_GUIDANCE_CHECKLIST_STATUSES,
  REGULARIZE_GUIDANCE_TARGET_TYPES,
} from "@workspace/shared";
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

const guidanceChecklistItemSchema = z
  .object({
    code: z.enum(REGULARIZE_GUIDANCE_CHECKLIST_CODES),
    status: z.enum(REGULARIZE_GUIDANCE_CHECKLIST_STATUSES),
    observation: z.string().optional(),
  })
  .strict();

const guidanceChecklistSchema = z
  .array(guidanceChecklistItemSchema)
  .superRefine((items, context) => {
    const codes = new Set(items.map((item) => item.code));
    if (
      items.length !== REGULARIZE_GUIDANCE_CHECKLIST_CODES.length ||
      codes.size !== items.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Checklist deve conter exatamente os 17 itens canônicos, sem duplicidades.",
      });
    }
  });

const guidanceTargetSnapshotSchema = z
  .object({
    version: z.literal(1),
    source: z.literal("manual"),
    name: z.string().trim().min(1, "name obrigatorio."),
    document: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    type: z.string().optional(),
    request: z.string().optional(),
    framework_obs: z.string().optional(),
    legal_nature: z.string().optional(),
    company_name: z.string().optional(),
    trade_name: z.string().optional(),
    cpf_cnpj: z.string().optional(),
    share_capital: z.union([z.number(), z.string()]).optional(),
    iptu: z.string().optional(),
    comporate_purpose: z.string().optional(),
    carryng: z.string().optional(),
    regime: z.string().optional(),
    legal_representative: z.string().optional(),
    economic_activities: z.array(guidanceEconomicActivitySchema).optional(),
    partners: z.array(guidancePartnerSchema).optional(),
    status: guidanceWriteStatusSchema.optional(),
  })
  .strict();

const guidanceBranchDataSchema = z
  .object({
    name: z.string().trim().min(1, "name obrigatorio."),
    document: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1, "address obrigatorio."),
    city: z.string().trim().min(1, "city obrigatoria."),
    state: z.string().trim().min(1, "state obrigatorio."),
  })
  .strict();

function validateGuidanceTarget(
  value: {
    target_type?: (typeof REGULARIZE_GUIDANCE_TARGET_TYPES)[number];
    client_pj_id?: string | null;
    client_pf_id?: string | null;
    target_snapshot?: unknown;
  },
  context: z.RefinementCtx,
): void {
  if (value.target_type === "PJ" && (!value.client_pj_id || value.client_pf_id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["client_pj_id"],
      message: "PJ exige apenas client_pj_id.",
    });
  }
  if (value.target_type === "PF" && (!value.client_pf_id || value.client_pj_id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["client_pf_id"],
      message: "PF exige apenas client_pf_id.",
    });
  }
  if (
    value.target_type === "SEM_CLIENTE" &&
    (value.client_pj_id ||
      value.client_pf_id ||
      !guidanceTargetSnapshotSchema.safeParse(value.target_snapshot).success)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target_snapshot"],
      message: "SEM_CLIENTE exige snapshot manual válido e não aceita cadastro.",
    });
  }
}

function validateBranchData(
  value: { checklist?: z.infer<typeof guidanceChecklistSchema>; branch_data?: unknown },
  context: z.RefinementCtx,
): void {
  if (!value.checklist) {
    if (value.branch_data !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["branch_data"],
        message: "branch_data exige checklist com filial concluída.",
      });
    }
    return;
  }

  const branchCompleted = value.checklist.some(
    (item) => item.code === "branch" && item.status === "Concluído",
  );
  if (branchCompleted && !guidanceBranchDataSchema.safeParse(value.branch_data).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branch_data"],
      message: "branch_data válido é obrigatório quando a filial estiver concluída.",
    });
  }
  if (!branchCompleted && value.branch_data !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branch_data"],
      message: "branch_data só é aceito quando a filial estiver concluída.",
    });
  }
}

export const createGuidanceBodySchema = z
  .object({
    process_id: z.string().uuid("process_id invalido.").nullable().optional(),
    target_type: z.enum(REGULARIZE_GUIDANCE_TARGET_TYPES),
    client_pj_id: z.string().uuid("client_pj_id invalido.").nullable().optional(),
    client_pf_id: z.string().uuid("client_pf_id invalido.").nullable().optional(),
    target_snapshot: guidanceTargetSnapshotSchema.optional(),
    checklist: guidanceChecklistSchema,
    branch_data: guidanceBranchDataSchema.optional(),
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
  .strict()
  .superRefine(validateGuidanceTarget)
  .superRefine(validateBranchData);

export const updateGuidanceBodySchema = z
  .object({
    id: z.string().uuid("id invalido."),
    process_id: z.string().uuid("process_id invalido.").nullable().optional(),
    target_type: z.enum(REGULARIZE_GUIDANCE_TARGET_TYPES).optional(),
    client_pj_id: z.string().uuid("client_pj_id invalido.").nullable().optional(),
    client_pf_id: z.string().uuid("client_pf_id invalido.").nullable().optional(),
    target_snapshot: guidanceTargetSnapshotSchema.optional(),
    checklist: guidanceChecklistSchema.optional(),
    branch_data: guidanceBranchDataSchema.optional(),
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
  .refine((value) => Object.keys(value).length > 1, "Informe ao menos um campo para atualizar.")
  .superRefine(validateGuidanceTarget)
  .superRefine(validateBranchData);

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
