import { ServiceError } from "@workspace/shared";

import prismaClient from "../prisma/index.js";
import { AuthService, type LoginResult } from "./authService.js";

const ACTIVE_STATUS = "active";

export interface UserOrganizationSummary {
  organization_id: string;
  name: string;
  slug: string;
  status: string;
  department_id: string | null;
}

export class UserOrganizationService {
  constructor(
    private readonly prisma = prismaClient,
    private readonly authService = new AuthService(),
  ) {}

  async listForUser(userId: string): Promise<UserOrganizationSummary[]> {
    const memberships = await this.prisma.userOrganization.findMany({
      where: {
        user_id: userId,
        status: ACTIVE_STATUS,
        organization: { status: "active" },
      },
      select: {
        organization_id: true,
        department_id: true,
        organization: { select: { name: true, slug: true, status: true } },
      },
      orderBy: { organization: { name: "asc" } },
    });

    return memberships.map((membership) => ({
      organization_id: membership.organization_id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      department_id: membership.department_id,
    }));
  }

  async switchOrganization(userId: string, organizationId: string): Promise<LoginResult> {
    const membership = await this.prisma.userOrganization.findFirst({
      where: { user_id: userId, organization_id: organizationId, status: ACTIVE_STATUS },
      select: {
        organization_id: true,
        department_id: true,
        organization: { select: { status: true } },
        department: { select: { id: true, organization_id: true } },
      },
    });

    if (!membership || membership.organization.status !== "active") {
      throw new ServiceError(403, "Usuário sem associação ativa com esta organização.");
    }

    if (
      !membership.department_id ||
      !membership.department ||
      membership.department.organization_id !== organizationId
    ) {
      throw new ServiceError(403, "Departamento inválido para esta organização.");
    }

    const permission = await this.prisma.permission.findFirst({
      where: { user_id: userId, organization_id: organizationId },
      select: { id: true },
    });

    if (!permission) {
      throw new ServiceError(403, "Usuário sem permissões nesta organização.");
    }

    return this.authService.createSession({
      userId,
      organizationId,
      departmentId: membership.department_id,
    });
  }
}
