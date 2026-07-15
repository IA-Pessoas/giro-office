import { type PlatformRole, ServiceError } from "@workspace/shared";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { getUserServiceEnv } from "../config/env.js";
import {
  PlatformRole as PrismaPlatformRole,
  SupportSessionStatus,
} from "../generated/prisma/enums.js";
import prismaClient from "../prisma/index.js";

interface PlatformLoginInput {
  email: string;
  password: string;
}

interface StartSupportSessionInput {
  platformUserId: string;
  organizationId: string;
  reason: string;
}

export interface PlatformLoginResult {
  id: string;
  name: string;
  email: string;
  platform_role: PlatformRole;
  token: string;
}

export interface PlatformMeResult {
  id: string;
  name: string;
  email: string;
  platform_role: PlatformRole;
  status: string;
}

export interface StartSupportSessionResult {
  support_session_id: string;
  organization_id: string;
  reason: string;
  expires_at: string;
  token: string;
}

export interface EndSupportSessionResult {
  platform_user_id: string;
  support_session_id: string;
}

const SUPPORT_SESSION_TTL_MS = 60 * 60 * 1000;

function assertSuperAdminRole(role: string): asserts role is PlatformRole {
  if (role !== PrismaPlatformRole.super_admin) {
    throw new ServiceError(403, "Usuario de plataforma sem permissao.");
  }
}

export class PlatformAuthService {
  async login({ email, password }: PlatformLoginInput): Promise<PlatformLoginResult> {
    const platformUser = await prismaClient.platformUser.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        platform_role: true,
        status: true,
      },
    });

    if (!platformUser || platformUser.status !== "active") {
      throw new ServiceError(401, "Credenciais invalidas.");
    }

    assertSuperAdminRole(platformUser.platform_role);

    const passwordMatch = await bcrypt.compare(password, platformUser.password);
    if (!passwordMatch) {
      throw new ServiceError(401, "Credenciais invalidas.");
    }

    const token = jwt.sign(
      {
        user_id: platformUser.id,
        auth_kind: "platform",
        platform_role: platformUser.platform_role,
        name: platformUser.name,
        login: platformUser.email,
      },
      getUserServiceEnv().jwtSecret,
      { subject: platformUser.id, expiresIn: "1d" },
    );

    return {
      id: platformUser.id,
      name: platformUser.name,
      email: platformUser.email,
      platform_role: platformUser.platform_role,
      token,
    };
  }

  async getMe(platformUserId: string): Promise<PlatformMeResult> {
    const platformUser = await prismaClient.platformUser.findUnique({
      where: { id: platformUserId },
      select: {
        id: true,
        name: true,
        email: true,
        platform_role: true,
        status: true,
      },
    });

    if (!platformUser || platformUser.status !== "active") {
      throw new ServiceError(401, "Usuario de plataforma inativo.");
    }

    assertSuperAdminRole(platformUser.platform_role);

    return platformUser;
  }

  async startSupportSession({
    platformUserId,
    organizationId,
    reason,
  }: StartSupportSessionInput): Promise<StartSupportSessionResult> {
    await this.getMe(platformUserId);

    const organization = await prismaClient.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, status: true },
    });

    if (!organization) {
      throw new ServiceError(404, "Organizacao nao encontrada.");
    }

    if (organization.status !== "active") {
      throw new ServiceError(403, "Organizacao inativa para suporte.");
    }

    const expiresAt = new Date(Date.now() + SUPPORT_SESSION_TTL_MS);
    const supportSession = await prismaClient.supportSession.create({
      data: {
        platform_user_id: platformUserId,
        organization_id: organizationId,
        reason,
        expires_at: expiresAt,
      },
      select: { id: true, organization_id: true, reason: true, expires_at: true },
    });

    const token = jwt.sign(
      {
        user_id: platformUserId,
        auth_kind: "platform",
        platform_role: PrismaPlatformRole.super_admin,
        support_mode: true,
        support_session_id: supportSession.id,
        support_organization_id: supportSession.organization_id,
        organization_id: supportSession.organization_id,
      },
      getUserServiceEnv().jwtSecret,
      { subject: platformUserId, expiresIn: "1h" },
    );

    return {
      support_session_id: supportSession.id,
      organization_id: supportSession.organization_id,
      reason: supportSession.reason,
      expires_at: supportSession.expires_at.toISOString(),
      token,
    };
  }

  async endSupportSession(
    platformUserId: string,
    supportSessionId: string,
  ): Promise<EndSupportSessionResult> {
    const result = await prismaClient.supportSession.updateMany({
      where: {
        id: supportSessionId,
        platform_user_id: platformUserId,
        status: SupportSessionStatus.active,
      },
      data: { status: SupportSessionStatus.closed, ended_at: new Date() },
    });

    if (result.count === 0) {
      throw new ServiceError(404, "Sessao de suporte nao encontrada.");
    }

    return { platform_user_id: platformUserId, support_session_id: supportSessionId };
  }
}
