import { ServiceError } from "@workspace/shared";

type DepartmentResolverClient = {
  department: {
    findFirst(input: {
      where: { organization_id: string; name: { equals: string; mode: "insensitive" } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

export class TiDepartmentResolverService {
  constructor(private readonly prisma: DepartmentResolverClient) {}

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
