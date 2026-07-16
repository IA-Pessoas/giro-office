import { getSingleQueryValue, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { status as statusEnum } from "../generated/prisma/client.js";

export const createOrganizationBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    email_created_by: zNonEmptyText("email_created_by"),
    cnpj: zNonEmptyText("cnpj"),
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

export const updatePlatformOrganizationBodySchema = z
  .object({
    status: z
      .nativeEnum(statusEnum, {
        message: "status deve ser trial, past_due, active, suspended ou cancelled.",
      })
      .optional(),
    subscription_plan: zNonEmptyText("subscription_plan").optional(),
    logo_url: z.union([z.string(), z.null()]).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.status !== undefined || data.subscription_plan !== undefined || "logo_url" in data,
    {
      message: "Informe ao menos um campo para atualizar.",
    },
  );

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
