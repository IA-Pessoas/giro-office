import { z } from "zod";

import { idQuerySchema } from "./common.schemas.js";

export const createClientPfBodySchema = z
  .object({
    code: z.string().min(1, "code obrigatório."),
    name: z.string().min(1, "name obrigatório."),
    sex: z.string().min(1, "sex obrigatório."),
    address: z.string().min(1, "address obrigatório."),
    city: z.string().min(1, "city obrigatório."),
    zip_code: z.string().min(1, "zip_code obrigatório."),
    state: z.string().min(1, "state obrigatório."),
    profession: z.string().min(1, "profession obrigatório."),
    father: z.string().optional().default(""),
    mother: z.string().min(1, "mother obrigatório."),
    marital_status: z.string().min(1, "marital_status obrigatório."),
    date_of_birth: z.coerce.date(),
    cpf: z.string().min(1, "cpf obrigatório."),
    rg: z.string().min(1, "rg obrigatório."),
    rg_expedition: z.coerce.date().optional(),
    rg_validity: z.coerce.date().optional(),
    military_certificate: z.string().optional().default(""),
    ctps: z.string().optional().default(""),
    cnh: z.string().optional().default(""),
    cnh_expedition: z.coerce.date().optional(),
    cnh_validity: z.coerce.date().optional(),
    spouse: z.string().optional().default(""),
    notes: z.string().optional().default(""),
    status: z.string().min(1, "status obrigatório."),
  })
  .strict();

export const updateClientPfBodySchema = createClientPfBodySchema
  .extend({
    id: z.string().uuid("id inválido."),
  })
  .strict();

export const clientPfDetailQuerySchema = idQuerySchema;

export const listClientPfQuerySchema = z
  .object({
    status: z.string().min(1, "status obrigatório."),
    search: z.string().trim().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateClientPfBody = z.infer<typeof createClientPfBodySchema>;
export type UpdateClientPfBody = z.infer<typeof updateClientPfBodySchema>;
