import { defaultErrorMap, ZodError, type ZodIssue, type ZodTypeAny, type z } from "zod";

import { ServiceError } from "../http/errors.js";

function isDefaultZodMessage(issue: ZodIssue): boolean {
  return defaultErrorMap(issue, { defaultError: "", data: undefined }).message === issue.message;
}

/**
 * Mensagem do primeiro problema de validação para o usuário. Mensagens definidas no schema
 * são de negócio e passam; as padrão do Zod ("Unrecognized key(s) in object") viram um
 * texto em português com o campo (#1365).
 */
export function zodIssueMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dados inválidos.";
  if (!isDefaultZodMessage(issue)) return issue.message;
  if (issue.code === "unrecognized_keys") {
    return `Dados inválidos: campo não permitido (${issue.keys.join(", ")}).`;
  }
  return issue.path.length > 0
    ? `Dados inválidos: campo ${issue.path.join(".")}.`
    : "Dados inválidos.";
}

export function parseWithZod<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      throw new ServiceError(400, zodIssueMessage(err));
    }
    throw err;
  }
}
