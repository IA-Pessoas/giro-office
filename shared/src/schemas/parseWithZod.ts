import { ZodError, type ZodType } from "zod";

import { ServiceError } from "../http/errors.js";

export function parseWithZod<T>(schema: ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const message = first?.message ?? "Dados inválidos.";
      throw new ServiceError(400, message);
    }
    throw err;
  }
}
