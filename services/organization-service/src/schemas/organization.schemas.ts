import { getSingleQueryValue, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { isValidCnpj, normalizeCnpj } from "../domain/cnpj.js";
import { status as statusEnum } from "../generated/prisma/client.js";

const cnpjSchema = z
  .string()
  .refine(isValidCnpj, { message: "cnpj inválido." })
  .transform(normalizeCnpj);

export const createOrganizationBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    email_created_by: zNonEmptyText("email_created_by"),
    cnpj: cnpjSchema,
  })
  .strict();

export const organizationIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const updateOrganizationStatusBodySchema = z
  .object({
    status: z.nativeEnum(statusEnum, {
      message: "status é obrigatório e deve ser trial, past_due, active, suspended ou cancelled.",
    }),
  })
  .strict();

export const updateOrganizationSubscriptionPlanBodySchema = z
  .object({
    subscription_plan: zNonEmptyText("subscription_plan"),
  })
  .strict();

export const updateOrganizationLogoUrlBodySchema = z
  .object({
    logo_url: z.union([z.string(), z.null()]),
  })
  .strict();

const expectedUpdatedAtSchema = z.string().datetime({
  offset: true,
  message: "expected_updated_at deve ser uma data ISO válida.",
});

const httpsLogoUrlSchema = z
  .string()
  .max(2_048, "logo_url deve ter no máximo 2.048 caracteres.")
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "logo_url deve ser uma URL HTTPS sem credenciais.",
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "logo_url deve ser uma URL HTTPS válida.",
      });
    }
  });

export const createPlatformOrganizationBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    cnpj: cnpjSchema,
  })
  .strict();

export const platformOrganizationIdParamsSchema = organizationIdParamsSchema;

export const updatePlatformOrganizationStatusBodySchema = z
  .object({
    status: z.nativeEnum(statusEnum, {
      message: "status é obrigatório e deve ser trial, past_due, active, suspended ou cancelled.",
    }),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict();

export const updatePlatformOrganizationSubscriptionPlanBodySchema = z
  .object({
    subscription_plan: z.enum(["trial", "pro", "enterprise"], {
      message: "subscription_plan deve ser trial, pro ou enterprise.",
    }),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict();

export const updatePlatformOrganizationLogoUrlBodySchema = z
  .object({
    logo_url: z.union([httpsLogoUrlSchema, z.null()]),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict();

export const listOrganizationsQuerySchema = z
  .object({
    page: z.preprocess(
      (v) => {
        const raw = getSingleQueryValue(v);
        if (raw === undefined || raw === "") {
          return 1;
        }
        return Number(raw);
      },
      z.number().int().min(1, "page deve ser um inteiro maior ou igual a 1."),
    ),
    pageSize: z.preprocess(
      (v) => {
        const raw = getSingleQueryValue(v);
        if (raw === undefined || raw === "") {
          return 20;
        }
        return Number(raw);
      },
      z
        .number()
        .int()
        .min(1, "pageSize deve ser um inteiro entre 1 e 100.")
        .max(100, "pageSize deve ser um inteiro entre 1 e 100."),
    ),
    status: z.preprocess((v) => {
      const raw = getSingleQueryValue(v);
      if (raw === undefined || raw === "") {
        return undefined;
      }
      return raw;
    }, z.nativeEnum(statusEnum).optional()),
  })
  .strict();

const MAX_PLATFORM_OFFSET = 10_000;

export const listPlatformOrganizationsQuerySchema = z
  .object({
    page: z.preprocess(
      (v) => {
        const raw = getSingleQueryValue(v);
        if (raw === undefined || raw === "") {
          return 1;
        }
        return Number(raw);
      },
      z
        .number()
        .int()
        .min(1, "page deve ser um inteiro maior ou igual a 1.")
        .max(10_001, "page excede a janela administrativa permitida."),
    ),
    pageSize: z.preprocess(
      (v) => {
        const raw = getSingleQueryValue(v);
        if (raw === undefined || raw === "") {
          return 20;
        }
        return Number(raw);
      },
      z
        .number()
        .int()
        .min(1, "pageSize deve ser um inteiro entre 1 e 100.")
        .max(100, "pageSize deve ser um inteiro entre 1 e 100."),
    ),
    status: z.preprocess((v) => {
      const raw = getSingleQueryValue(v);
      if (raw === undefined || raw === "") {
        return undefined;
      }
      return raw;
    }, z.nativeEnum(statusEnum).optional()),
    search: z.preprocess((v) => getSingleQueryValue(v), z.string().trim().max(100).optional()),
  })
  .strict()
  .superRefine(({ page, pageSize }, context) => {
    if ((page - 1) * pageSize > MAX_PLATFORM_OFFSET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["page"],
        message: "A combinação de page e pageSize excede a janela administrativa permitida.",
      });
    }
  });
