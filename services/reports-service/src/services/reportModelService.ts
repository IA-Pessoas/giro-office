import { ServiceError } from "@workspace/shared";

import type { ReportsPrismaClient } from "../prisma/index.js";
import type { ReportDefinition } from "../schemas/reportDefinition.schemas.js";

export interface PersonalReportModel {
  id: string;
  organization_id: string;
  name: string;
  version: number;
  definition: ReportDefinition;
}

export interface ReportModelActor {
  organizationId: string;
  userId: string;
}

export interface CreatePersonalReportModelInput extends ReportModelActor {
  name: string;
  definition: ReportDefinition;
}

export interface UpdatePersonalReportModelInput extends ReportModelActor {
  id: string;
  name?: string;
  definition: ReportDefinition;
}

const MODEL_NOT_FOUND = "Modelo de relatório não encontrado.";
const UPDATE_RETRY_LIMIT = 3;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export class ReportModelService {
  constructor(private readonly prisma: ReportsPrismaClient) {}

  async create(input: CreatePersonalReportModelInput): Promise<PersonalReportModel> {
    return this.prisma.$transaction(async (transaction) => {
      const model = await transaction.reportModel.create({
        data: {
          organization_id: input.organizationId,
          created_by_user_id: input.userId,
          department_id: null,
          name: input.name,
        },
      });
      const version = await transaction.reportModelVersion.create({
        data: {
          organization_id: input.organizationId,
          report_model_id: model.id,
          version: 1,
          definition_json: input.definition,
        },
      });

      return this.toModel(model, version);
    });
  }

  async list(input: ReportModelActor): Promise<PersonalReportModel[]> {
    const models = await this.prisma.reportModel.findMany({
      where: {
        organization_id: input.organizationId,
        created_by_user_id: input.userId,
        department_id: null,
      },
      orderBy: { updated_at: "desc" },
    });

    return Promise.all(
      models.map(async (model) => this.toModel(model, await this.latestVersion(model.id, input))),
    );
  }

  async get(input: ReportModelActor & { id: string }): Promise<PersonalReportModel> {
    const model = await this.findOwnedModel(input);
    return this.toModel(model, await this.latestVersion(model.id, input));
  }

  async update(input: UpdatePersonalReportModelInput): Promise<PersonalReportModel> {
    for (let attempt = 0; attempt < UPDATE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const model = await transaction.reportModel.findFirst({
            where: {
              id: input.id,
              organization_id: input.organizationId,
              created_by_user_id: input.userId,
              department_id: null,
            },
          });
          if (!model) throw new ServiceError(404, MODEL_NOT_FOUND);

          const currentVersion = await transaction.reportModelVersion.findFirst({
            where: {
              organization_id: input.organizationId,
              report_model_id: model.id,
            },
            orderBy: { version: "desc" },
          });
          if (!currentVersion) throw new ServiceError(404, MODEL_NOT_FOUND);

          const updatedModel = await transaction.reportModel.update({
            where: { id: model.id },
            data: input.name === undefined ? {} : { name: input.name },
          });
          const version = await transaction.reportModelVersion.create({
            data: {
              organization_id: input.organizationId,
              report_model_id: model.id,
              version: currentVersion.version + 1,
              definition_json: input.definition,
            },
          });

          return this.toModel(updatedModel, version);
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    throw new ServiceError(409, "O modelo foi atualizado simultaneamente. Tente novamente.");
  }

  async delete(input: ReportModelActor & { id: string }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const model = await transaction.reportModel.findFirst({
        where: {
          id: input.id,
          organization_id: input.organizationId,
          created_by_user_id: input.userId,
          department_id: null,
        },
      });
      if (!model) throw new ServiceError(404, MODEL_NOT_FOUND);

      await transaction.reportModelVersion.deleteMany({
        where: {
          organization_id: input.organizationId,
          report_model_id: model.id,
        },
      });
      await transaction.reportModel.delete({ where: { id: model.id } });
    });
  }

  private async findOwnedModel(
    input: ReportModelActor & { id: string },
  ): Promise<NonNullable<Awaited<ReturnType<ReportsPrismaClient["reportModel"]["findFirst"]>>>> {
    const model = await this.prisma.reportModel.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
        created_by_user_id: input.userId,
        department_id: null,
      },
    });
    if (!model) throw new ServiceError(404, MODEL_NOT_FOUND);
    return model;
  }

  private async latestVersion(id: string, input: ReportModelActor) {
    const version = await this.prisma.reportModelVersion.findFirst({
      where: {
        organization_id: input.organizationId,
        report_model_id: id,
      },
      orderBy: { version: "desc" },
    });
    if (!version) throw new ServiceError(404, MODEL_NOT_FOUND);
    return version;
  }

  private toModel(
    model: { id: string; organization_id: string; name: string },
    version: { version: number; definition_json: unknown },
  ): PersonalReportModel {
    return {
      id: model.id,
      organization_id: model.organization_id,
      name: model.name,
      version: version.version,
      definition: version.definition_json as ReportDefinition,
    };
  }
}
