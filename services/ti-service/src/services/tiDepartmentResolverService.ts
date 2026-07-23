import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";

export class TiDepartmentResolverService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveTechnologyDepartmentId(organizationId: string): Promise<string> {
    const department = await this.prisma.department.findFirst({
      where: {
        organization_id: organizationId,
        name: { equals: "Tecnologia", mode: "insensitive" },
      },
      select: { id: true },
    });

    if (!department) {
      throw new ServiceError(404, "Departamento Tecnologia nao encontrado.");
    }

    return department.id;
  }
}
