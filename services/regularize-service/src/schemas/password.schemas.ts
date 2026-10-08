import { z } from "zod";

import { booleanQuerySchema, idQuerySchema } from "./common.schemas.js";

export const createPasswordBodySchema = z
  .object({
    client_id: z.string().uuid("client_id inválido."),
    site_id: z.string().uuid("site_id inválido."),
    login: z.string().min(1, "login obrigatório."),
    password: z.string().min(1, "password obrigatório."),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const updatePasswordBodySchema = createPasswordBodySchema
  .extend({
    id: z.string().uuid("id inválido."),
  })
  .strict();

export const listPasswordsQuerySchema = z
  .object({
    client_id: z.string().uuid("client_id inválido."),
  })
  .strict();

export const passwordDetailQuerySchema = idQuerySchema;

export const createSitePasswordBodySchema = z
  .object({
    name: z.string().min(1, "name obrigatório."),
    sphere: z.string().min(1, "sphere obrigatório."),
    link: z.string().url("link inválido.").nullable().optional(),
    user: z.string().min(1, "user obrigatório."),
    password: z.string().min(1, "password obrigatório."),
  })
  .strict();

export const updateSitePasswordBodySchema = createSitePasswordBodySchema
  .extend({
    id: z.string().uuid("id inválido."),
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
