import { extractBearerToken, verifyJwtToken } from "@workspace/shared";
import type { Request, Response, NextFunction } from "express";

import { prismaClient } from "../integrations/prisma.js";

export async function isAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const authToken = request.headers.authorization;

  if (!authToken) {
    response.status(401).end();
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined in environment variables");
    }

    const token = extractBearerToken(authToken);
    const claims = verifyJwtToken(token, jwtSecret);

    request.user_id = claims.user_id;
    if (claims.organization_id) {
      request.organization_id = claims.organization_id;
    }

    const { cnpj } = request.params;
    if (cnpj) {
      const organizationId = request.organization_id;
      if (!organizationId) {
        response.status(403).json({ error: "Acesso à organização não autorizado." });
        return;
      }

      const organization = await prismaClient.organization.findFirst({
        where: { cnpj },
        select: { id: true },
      });

      if (!organization) {
        response.status(404).json({ error: "Organização não encontrada." });
        return;
      }

      if (organization.id !== organizationId) {
        response.status(403).json({ error: "Acesso à organização não autorizado." });
        return;
      }
    }

    next();
  } catch {
    return response.status(401).end();
  }
}
