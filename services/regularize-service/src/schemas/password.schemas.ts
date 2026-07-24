import { z } from "zod";

import { booleanQuerySchema, idQuerySchema } from "./common.schemas.js";

export const createPasswordBodySchema = z
  .object({
    client_id: z.string().uuid("client_id invalido."),
    site_id: z.string().uuid("site_id invalido."),
    login: z.string().min(1, "login obrigatorio."),
    password: z.string().min(1, "password obrigatorio."),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const updatePasswordBodySchema = createPasswordBodySchema
  .extend({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const listPasswordsQuerySchema = z
  .object({
    client_id: z.string().uuid("client_id invalido."),
  })
  .strict();

export const passwordDetailQuerySchema = idQuerySchema;

export const createSitePasswordBodySchema = z
  .object({
    name: z.string().min(1, "name obrigatorio."),
    sphere: z.string().min(1, "sphere obrigatorio."),
    link: z.string().url("link invalido.").nullable().optional(),
    user: z.string().min(1, "user obrigatorio."),
    password: z.string().min(1, "password obrigatorio."),
  })
  .strict();

export const updateSitePasswordBodySchema = createSitePasswordBodySchema
  .extend({
    id: z.string().uuid("id invalido."),
    status: z.boolean(),
  })
  .strict();

export const listSitePasswordsQuerySchema = z
  .object({
    status: booleanQuerySchema,
    search: z.string().trim().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const sitePasswordDetailQuerySchema = idQuerySchema;

export type CreatePasswordBody = z.infer<typeof createPasswordBodySchema>;
export type UpdatePasswordBody = z.infer<typeof updatePasswordBodySchema>;
export type ListPasswordsQuery = z.infer<typeof listPasswordsQuerySchema>;
export type CreateSitePasswordBody = z.infer<typeof createSitePasswordBodySchema>;
export type UpdateSitePasswordBody = z.infer<typeof updateSitePasswordBodySchema>;
export type ListSitePasswordsQuery = z.infer<typeof listSitePasswordsQuerySchema>;
