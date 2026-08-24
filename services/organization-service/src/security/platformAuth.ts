import {
  AUTH_SESSION_COOKIE_NAME,
  readCookie,
  ServiceError,
  verifyJwtToken,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";

import { getOrganizationEnv } from "../config/env.js";
import { prismaClient } from "../integrations/prisma.js";

const PLATFORM_ROLE = "super_admin";
const CSRF_HASH_PATTERN = /^[a-f0-9]{64}$/u;

function unauthenticated(): ServiceError {
  return new ServiceError(401, "Não autenticado.");
}

function requirePlatformClaims(token: string): {
  userId: string;
  sessionId: string;
  sessionVersion: number;
  csrfHash: string;
} {
  const claims = verifyJwtToken(token, getOrganizationEnv().jwtSecret);
  const sessionVersion = claims.session_version;
  if (claims.auth_kind !== "platform" || claims.platform_role !== PLATFORM_ROLE) {
    throw new ServiceError(403, "Acesso negado.");
  }
  if (
    !claims.user_id ||
    !claims.session_id ||
    typeof sessionVersion !== "number" ||
    !Number.isSafeInteger(sessionVersion) ||
    sessionVersion < 0 ||
    !claims.csrf_hash ||
    !CSRF_HASH_PATTERN.test(claims.csrf_hash)
  ) {
    throw unauthenticated();
  }

  return {
    userId: claims.user_id,
    sessionId: claims.session_id,
    sessionVersion,
    csrfHash: claims.csrf_hash,
  };
}

export async function requirePlatformSession(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const token = readCookie(request.headers.cookie, AUTH_SESSION_COOKIE_NAME);
  if (!token) {
    next(unauthenticated());
    return;
  }

  let claims: ReturnType<typeof requirePlatformClaims>;
  try {
    claims = requirePlatformClaims(token);
  } catch (err: unknown) {
    next(err instanceof ServiceError ? err : unauthenticated());
    return;
  }

  try {
    const session = await prismaClient.platformAuthSession.findFirst({
      where: {
        id: claims.sessionId,
        platform_user_id: claims.userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: {
        csrf_hash: true,
        platformUser: {
          select: {
            id: true,
            platform_role: true,
            status: true,
            session_version: true,
          },
        },
      },
    });
    const user = session?.platformUser;
    if (
      !user ||
      user.id !== claims.userId ||
      user.platform_role !== PLATFORM_ROLE ||
      user.status !== "active" ||
      user.session_version !== claims.sessionVersion ||
      session.csrf_hash !== claims.csrfHash
    ) {
      next(unauthenticated());
      return;
    }
  } catch (err: unknown) {
    next(err);
    return;
  }

  next();
}
