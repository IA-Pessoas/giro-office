import { z } from "zod";

export const clientGroupParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const createClientGroupBodySchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();
export const updateClientGroupBodySchema = createClientGroupBodySchema;
export const replaceClientGroupClientsBodySchema = z
  .object({ client_ids: z.array(z.string().uuid()).max(500) })
  .strict();
