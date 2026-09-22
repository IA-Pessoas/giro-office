import type { WorkerAuthContext } from "./auth.js";
import type { ServiceBinding } from "./env.js";

export interface ValidateWorkerSessionOptions {
  internalServiceToken: string;
}

export class WorkerSessionValidationError extends Error {
  readonly statusCode: 401 | 409 | 503;

  constructor(statusCode: 401 | 409 | 503) {
    super(statusCode === 503 ? "Não foi possível validar a sessão." : "Sessão inválida.");
    this.name = "WorkerSessionValidationError";
    this.statusCode = statusCode;
  }
}

export async function validateWorkerSession(
  auth: WorkerAuthContext,
  userServiceBinding: ServiceBinding,
  transport: "cookie" | "bearer",
  options: ValidateWorkerSessionOptions,
): Promise<void> {
  const path =
    auth.actorKind === "platform" ? "/platform/session/validate" : "/user/session/validate";
  const method = auth.actorKind === "platform" ? "POST" : "GET";
  const request = new Request(`https://user-service.internal${path}`, {
    method,
    headers: {
      authorization: `Bearer ${auth.token}`,
      "x-auth-session-transport": transport,
      "x-internal-service-token": options.internalServiceToken,
    },
  });

  let response: Response;
  try {
    response = await userServiceBinding.fetch(request);
  } catch {
    throw new WorkerSessionValidationError(503);
  }

  if (!response.ok) {
    throw new WorkerSessionValidationError(
      response.status === 401 || response.status === 409 ? response.status : 503,
    );
  }
}
