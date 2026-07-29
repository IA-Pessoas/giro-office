import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { commaSeparatedListSchema, paginationQuerySchema } from "./pagination.schemas.js";

const icmsIdSchema = z.string().uuid({ message: "icms_id inválido." });

export const createIcmsBodySchema = z
  .object({
    state: zNonEmptyText("state"),
    item_number: z.string().optional(),
    cest_code: z.string().optional(),
    description: zNonEmptyText("description"),
    interstate_agreement: z.string().optional(),
    applied_original_mva: z.string().optional(),
    adjusted_mva: z.string().optional(),
    original_mva: z.string().optional(),
  })
  .strict();

export const updateIcmsBodySchema = z
  .object({
    icms_id: icmsIdSchema,
    state: zNonEmptyText("state"),
    item_number: z.string().optional(),
    cest_code: z.string().optional(),
    description: zNonEmptyText("description"),
    interstate_agreement: z.string().optional(),
    applied_original_mva: z.string().optional(),
    adjusted_mva: z.string().optional(),
    original_mva: z.string().optional(),
  })
  .strict();

export const detailIcmsQuerySchema = z
  .object({
    icms_id: icmsIdSchema,
  })
  .strict();

export const listIcmsQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    icmsCodes: commaSeparatedListSchema,
  })
  .strict();
