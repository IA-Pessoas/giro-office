import { z } from "zod";

export function zNonEmptyText(fieldName: string) {
  return z.string().trim().min(1, `${fieldName} é obrigatório.`);
}
