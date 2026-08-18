import { authenticateFromAuthHeader } from "@workspace/shared";

import type { SessionValidator } from "./authenticate.js";

export async function isAuthorizedWebSocketUpgrade(
  authorization: string | undefined,
  jwtSecret: string,
  sessionValidator: SessionValidator,
): Promise<boolean> {
  try {
    const auth = authenticateFromAuthHeader(authorization, jwtSecret);
    await sessionValidator(auth.token);
    return true;
  } catch {
    return false;
  }
}
