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
    code: z.string().min(1, "code obrigatório."),
    description: z.string().min(1, "description obrigatória."),
    type: z.enum(["Principal", "Secundária", "Secundaria"]),
  })
  .strict();

export const guidancePartnerSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, "name obrigatório."),
    cpf: z.string().min(1, "cpf obrigatório."),
    percentage: z.coerce.number().min(0).max(100).optional(),
    role: z.string().optional(),
    profession: z.string().optional(),
    marital_status: z.string().optional(),
    rg: z.string().optional(),
    cnh: z.string().optional(),
    address: z.string().optional(),
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
    name: z.string().trim().min(1, "name obrigatório."),
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
    name: z.string().trim().min(1, "name obrigatório."),
    document: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1, "address obrigatório."),
    city: z.string().trim().min(1, "city obrigatória."),
    state: z.string().trim().min(1, "state obrigatório."),
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
      message: "Sem cliente cadastrado, informe os dados manualmente e não vincule um cadastro.",
    });
  }
}

function validateBranchData(
  value: { checklist?: z.infer<typeof guidanceChecklistSchema>; branch_data?: unknown },
  context: z.RefinementCtx,
): void {
  if (!value.checklist) {
    if (value.branch_data !== undefined && value.branch_data !== null) {
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
  if (!branchCompleted && value.branch_data !== undefined && value.branch_data !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branch_data"],
      message: "branch_data só é aceito quando a filial estiver concluída.",
    });
  }
}

export const createGuidanceBodySchema = z
  .object({
    process_id: z.string().uuid("process_id inválido.").nullable().optional(),
    target_type: z.enum(REGULARIZE_GUIDANCE_TARGET_TYPES),
    client_pj_id: z.string().uuid("client_pj_id inválido.").nullable().optional(),
    client_pf_id: z.string().uuid("client_pf_id inválido.").nullable().optional(),
    target_snapshot: guidanceTargetSnapshotSchema.optional(),
    checklist: guidanceChecklistSchema,
    branch_data: guidanceBranchDataSchema.nullable().optional(),
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
    id: z.string().uuid("id inválido."),
    process_id: z.string().uuid("process_id inválido.").nullable().optional(),
    target_type: z.enum(REGULARIZE_GUIDANCE_TARGET_TYPES).optional(),
    client_pj_id: z.string().uuid("client_pj_id inválido.").nullable().optional(),
    client_pf_id: z.string().uuid("client_pf_id inválido.").nullable().optional(),
    target_snapshot: guidanceTargetSnapshotSchema.optional(),
    checklist: guidanceChecklistSchema.optional(),
    branch_data: guidanceBranchDataSchema.nullable().optional(),
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

export const guidanceDetailQuerySchema = z.object({ id: z.string().uuid("id inválido.") }).strict();

export const listGuidanceByProcessQuerySchema = z
  .object({
    process_id: z.string().uuid("process_id inválido.").nullable().optional(),
    target_type: z.enum(REGULARIZE_GUIDANCE_TARGET_TYPES).optional(),
  })
  .strict();

export const addGuidanceActivityBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id inválido."),
    activity: guidanceEconomicActivitySchema.omit({ id: true }),
  })
  .strict();

export const updateGuidanceActivityBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id inválido."),
    activity: guidanceEconomicActivitySchema,
  })
  .strict();

export const removeGuidanceActivityBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id inválido."),
    item_id: z.string().uuid("item_id inválido."),
  })
  .strict();

export const addGuidancePartnerBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id inválido."),
    partner: guidancePartnerSchema.omit({ id: true }),
  })
  .strict();

export const updateGuidancePartnerBodySchema = z
  .object({
    guidance_id: z.string().uuid("guidance_id inválido."),
    partner: guidancePartnerSchema,
  })
  .strict();

export const removeGuidancePartnerBodySchema = removeGuidanceActivityBodySchema;

export type CreateGuidanceBody = z.infer<typeof createGuidanceBodySchema>;
export type UpdateGuidanceBody = z.infer<typeof updateGuidanceBodySchema>;
export type GuidanceEconomicActivity = z.infer<typeof guidanceEconomicActivitySchema>;
export type GuidancePartner = z.infer<typeof guidancePartnerSchema>;
