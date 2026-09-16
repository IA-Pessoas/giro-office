import { randomUUID } from "node:crypto";

import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import {
  type AllergyInput,
  allergySchema,
  type ContactCreateInput,
  type ContactDeleteInput,
  type ContactUpdateInput,
  type DossierUpdateInput,
} from "../schemas/employeeDossier.schemas.js";

export const RH_SELF_SERVICE_PERMISSION = 1;
export const RH_DOSSIER_MANAGER_PERMISSION = 2;
export const RH_MANAGEMENT_PERMISSION = 3;

const DOSSIER_SELECT = {
  version: true,
  id: true,
  name: true,
  full_name: true,
  gender: true,
  birth_date: true,
  cpf: true,
  rg: true,
  address: true,
  job_title: true,
  email: true,
  phone: true,
  hire_date: true,
  dominio_hire_date: true,
  termination_date: true,
  photo_url: true,
  status: true,
  department_id: true,
  allergies: true,
  emergency_contacts: true,
  department: { select: { id: true, name: true } },
} as const;

const DOSSIER_LIST_SELECT = {
  id: true,
  name: true,
  full_name: true,
  job_title: true,
  photo_url: true,
  status: true,
  department: { select: { id: true, name: true } },
} as const;

type DossierRow = Prisma.UserGetPayload<{ select: typeof DOSSIER_SELECT }>;
type DossierListRow = Prisma.UserGetPayload<{ select: typeof DOSSIER_LIST_SELECT }>;

export interface EmployeeDossierContext {
  actorUserId: string;
  organizationId: string;
  targetUserId?: string;
  departmentId?: string;
  rhPermission: number;
}

export interface EmployeeDossierUpdateContext extends EmployeeDossierContext {
  changes: DossierUpdateInput;
}

export interface EmployeeDossierContactCreateContext extends EmployeeDossierContext {
  contact: ContactCreateInput;
}

export interface EmployeeDossierContactUpdateContext extends EmployeeDossierContext {
  contact: ContactUpdateInput;
}

export interface EmployeeDossierContactDeleteContext extends EmployeeDossierContext {
  contact: ContactDeleteInput;
}

export interface RhDepartment {
  id: string;
  name: string;
}

export interface RhAllergy {
  name: string;
  fonts: string;
  action: string;
}

export interface RhEmergencyContact {
  id: string;
  name: string;
  phone: string;
  reference?: string;
}

export interface EmployeeDossierListItem {
  id: string;
  full_name: string;
  job_title: string | null;
  department: RhDepartment | null;
  photo_url: string | null;
  status: string;
}

export interface EmployeeDossier {
  id: string;
  full_name: string;
  department_id: string;
  gender: string | null;
  birth_date: string | null;
  cpf: string | null;
  rg: string | null;
  address: string | null;
  job_title: string | null;
  department: RhDepartment | null;
  email: string | null;
  phone: string | null;
  hire_date: string | null;
  dominio_hire_date: string | null;
  termination_date: string | null;
  photo_url: string | null;
  status: string;
  allergies: RhAllergy[];
  emergency_contacts: RhEmergencyContact[];
}

function organizationScope(organizationId: string): Prisma.UserWhereInput {
  return {
    OR: [
      { organization_id: organizationId },
      { organization_id: null, department: { organization_id: organizationId } },
    ],
  };
}

function isoDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function parseAllergies(value: Prisma.JsonValue | null): RhAllergy[] {
  if (value === null) return [];
  const result = allergySchema.array().safeParse(value);
  if (!result.success) throw new ServiceError(500, "Dados de alergia inválidos no cadastro.");
  return result.data;
}

function parseContacts(value: Prisma.JsonValue | null): RhEmergencyContact[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new ServiceError(500, "Dados de contato inválidos no cadastro.");
  const contacts = value.filter(
    (item): item is Prisma.JsonObject =>
      item !== null && typeof item === "object" && !Array.isArray(item),
  );
  if (contacts.length !== value.length)
    throw new ServiceError(500, "Dados de contato inválidos no cadastro.");
  for (const contact of contacts) {
    if (
      typeof contact.id !== "string" ||
      typeof contact.name !== "string" ||
      contact.name.trim().length === 0 ||
      typeof contact.phone !== "string" ||
      contact.phone.trim().length === 0 ||
      (contact.reference !== undefined &&
        contact.reference !== null &&
        typeof contact.reference !== "string")
    ) {
      throw new ServiceError(500, "Dados de contato inválidos no cadastro.");
    }
  }
  return contacts.map((contact) => ({
    id: String(contact.id),
    name: String(contact.name),
    phone: String(contact.phone),
    ...(typeof contact.reference === "string" ? { reference: contact.reference } : {}),
  }));
}

function toDossier(row: DossierRow): EmployeeDossier {
  return {
    id: row.id,
    full_name: row.full_name ?? row.name,
    department_id: row.department_id,
    gender: row.gender,
    birth_date: isoDate(row.birth_date),
    cpf: row.cpf,
    rg: row.rg,
    address: row.address,
    job_title: row.job_title,
    department: row.department,
    email: row.email,
    phone: row.phone,
    hire_date: isoDate(row.hire_date),
    dominio_hire_date: isoDate(row.dominio_hire_date),
    termination_date: isoDate(row.termination_date),
    photo_url: row.photo_url,
    status: row.status,
    allergies: parseAllergies(row.allergies),
    emergency_contacts: parseContacts(row.emergency_contacts),
  };
}

function toListItem(row: DossierListRow): EmployeeDossierListItem {
  return {
    id: row.id,
    full_name: row.full_name ?? row.name,
    job_title: row.job_title,
    department: row.department,
    photo_url: row.photo_url,
    status: row.status,
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

class EmployeeDossierService {
  private async findUser(userId: string, organizationId: string): Promise<DossierRow> {
    const user = await prismaClient.user.findFirst({
      where: { AND: [{ id: userId }, organizationScope(organizationId)] },
      select: DOSSIER_SELECT,
    });
    if (!user) throw new ServiceError(404, "Colaborador não encontrado.");
    return user;
  }

  private async resolveTarget(
    context: EmployeeDossierContext,
  ): Promise<{ actor: DossierRow; target: DossierRow }> {
    if (context.rhPermission < RH_SELF_SERVICE_PERMISSION) {
      throw new ServiceError(403, "Permissão insuficiente para acessar o dossiê.");
    }
    const actor = await this.findUser(context.actorUserId, context.organizationId);
    const target = await this.findUser(
      context.targetUserId ?? context.actorUserId,
      context.organizationId,
    );
    const isSelf = actor.id === target.id;
    if (!isSelf && context.rhPermission < RH_MANAGEMENT_PERMISSION) {
      if (
        context.rhPermission === RH_DOSSIER_MANAGER_PERMISSION &&
        actor.department_id &&
        target.department_id &&
        actor.department_id === target.department_id
      )
        return { actor, target };
      throw new ServiceError(404, "Colaborador não encontrado.");
    }
    if (
      context.rhPermission === RH_DOSSIER_MANAGER_PERMISSION &&
      (!actor.department_id ||
        !target.department_id ||
        actor.department_id !== target.department_id)
    ) {
      throw new ServiceError(404, "Colaborador não encontrado.");
    }
    return { actor, target };
  }

  async getDossier(
    context: EmployeeDossierContext,
  ): Promise<EmployeeDossier | EmployeeDossierListItem> {
    try {
      const { target } = await this.resolveTarget(context);
      return context.rhPermission === RH_DOSSIER_MANAGER_PERMISSION
        ? toListItem(target)
        : toDossier(target);
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      logError("Erro ao buscar dossiê do colaborador", { err });
      throw new ServiceError(500, "Erro interno ao buscar dossiê.", err);
    }
  }

  async listDossiers(context: EmployeeDossierContext): Promise<EmployeeDossierListItem[]> {
    try {
      if (context.rhPermission < RH_SELF_SERVICE_PERMISSION) {
        throw new ServiceError(403, "Permissão insuficiente para listar colaboradores.");
      }
      const actor = await this.findUser(context.actorUserId, context.organizationId);
      const where: Prisma.UserWhereInput = organizationScope(context.organizationId);
      if (context.rhPermission === RH_SELF_SERVICE_PERMISSION) {
        where.AND = [{ id: actor.id }];
      } else if (context.rhPermission === RH_DOSSIER_MANAGER_PERMISSION) {
        if (!actor.department_id) {
          throw new ServiceError(403, "Gestor sem departamento não pode listar colaboradores.");
        }
        where.AND = [{ department_id: actor.department_id }];
      } else if (context.departmentId) {
        where.AND = [{ department_id: context.departmentId }];
      }
      const users = await prismaClient.user.findMany({
        where,
        orderBy: [{ full_name: "asc" }, { name: "asc" }],
        select: DOSSIER_LIST_SELECT,
      });
      return users.map(toListItem);
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      logError("Erro ao listar dossiês de colaboradores", { err });
      throw new ServiceError(500, "Erro interno ao listar colaboradores.", err);
    }
  }

  async updateDossier(context: EmployeeDossierUpdateContext): Promise<EmployeeDossier> {
    try {
      const { actor, target } = await this.resolveTarget(context);
      if (context.rhPermission === RH_DOSSIER_MANAGER_PERMISSION) {
        throw new ServiceError(403, "Gestor de departamento possui acesso somente à projeção.");
      }
      if (context.rhPermission < RH_MANAGEMENT_PERMISSION && actor.id !== target.id) {
        throw new ServiceError(403, "Você só pode alterar o próprio dossiê.");
      }
      const allowedFields =
        context.rhPermission >= RH_MANAGEMENT_PERMISSION
          ? [
              "full_name",
              "gender",
              "birth_date",
              "cpf",
              "rg",
              "address",
              "job_title",
              "email",
              "phone",
              "hire_date",
              "dominio_hire_date",
              "termination_date",
              "photo_url",
              "status",
              "department_id",
            ]
          : ["address", "email", "phone"];
      const data: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (field in context.changes)
          data[field] = context.changes[field as keyof DossierUpdateInput];
      }
      if (Object.keys(data).length === 0)
        throw new ServiceError(400, "Nenhum campo permitido para atualização.");
      if ("department_id" in data) {
        const department = await prismaClient.department.findFirst({
          where: { id: data.department_id as string, organization_id: context.organizationId },
          select: { id: true },
        });
        if (!department) throw new ServiceError(404, "Departamento não encontrado.");
      }
      await this.updateScopedUser(
        target,
        context.organizationId,
        data as Prisma.UserUpdateManyMutationInput,
      );
      const updated = await this.findUser(target.id, context.organizationId);
      return toDossier(updated);
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      logError("Erro ao atualizar dossiê do colaborador", { err });
      throw new ServiceError(500, "Erro interno ao atualizar dossiê.", err);
    }
  }

  async listContacts(context: EmployeeDossierContext): Promise<RhEmergencyContact[]> {
    const { actor, target } = await this.resolveTarget(context);
    this.assertSensitiveAccess(context, actor.id, target.id);
    return parseContacts(target.emergency_contacts);
  }

  async createContact(context: EmployeeDossierContactCreateContext): Promise<RhEmergencyContact> {
    const { actor, target } = await this.resolveTarget(context);
    this.assertSensitiveAccess(context, actor.id, target.id);
    const contact: RhEmergencyContact = {
      id: randomUUID(),
      name: context.contact.name,
      phone: context.contact.phone,
      ...(context.contact.reference ? { reference: context.contact.reference } : {}),
    };
    const contacts = [...parseContacts(target.emergency_contacts), contact];
    await this.updateScopedUser(target, context.organizationId, {
      emergency_contacts: asJson(contacts),
    });
    return contact;
  }

  async updateContact(context: EmployeeDossierContactUpdateContext): Promise<RhEmergencyContact> {
    const { actor, target } = await this.resolveTarget(context);
    this.assertSensitiveAccess(context, actor.id, target.id);
    const contacts = parseContacts(target.emergency_contacts);
    const index = contacts.findIndex((contact) => contact.id === context.contact.id);
    if (index < 0) throw new ServiceError(404, "Contato de emergência não encontrado.");
    const current = contacts[index];
    const updated: RhEmergencyContact = {
      id: current.id,
      name: context.contact.name ?? current.name,
      phone: context.contact.phone ?? current.phone,
      ...(context.contact.reference === undefined
        ? current.reference
          ? { reference: current.reference }
          : {}
        : context.contact.reference === null
          ? {}
          : { reference: context.contact.reference }),
    };
    contacts[index] = updated;
    await this.updateScopedUser(target, context.organizationId, {
      emergency_contacts: asJson(contacts),
    });
    return updated;
  }

  async deleteContact(context: EmployeeDossierContactDeleteContext): Promise<{ id: string }> {
    const { actor, target } = await this.resolveTarget(context);
    this.assertSensitiveAccess(context, actor.id, target.id);
    const contacts = parseContacts(target.emergency_contacts);
    const remaining = contacts.filter((contact) => contact.id !== context.contact.id);
    if (remaining.length === contacts.length)
      throw new ServiceError(404, "Contato de emergência não encontrado.");
    await this.updateScopedUser(target, context.organizationId, {
      emergency_contacts: asJson(remaining),
    });
    return { id: context.contact.id };
  }

  async listAllergies(context: EmployeeDossierContext): Promise<AllergyInput[]> {
    const { actor, target } = await this.resolveTarget(context);
    this.assertSensitiveAccess(context, actor.id, target.id);
    return parseAllergies(target.allergies);
  }

  async replaceAllergies(
    context: EmployeeDossierContext & { allergies: AllergyInput[] },
  ): Promise<AllergyInput[]> {
    const { actor, target } = await this.resolveTarget(context);
    this.assertSensitiveAccess(context, actor.id, target.id);
    const parsed = allergySchema.array().safeParse(context.allergies);
    if (!parsed.success) throw new ServiceError(400, "Alergia inválida.");
    const allergies = parsed.data;
    await this.updateScopedUser(target, context.organizationId, {
      allergies: asJson(allergies),
    });
    return allergies;
  }

  private assertSensitiveAccess(
    context: EmployeeDossierContext,
    actorId: string,
    targetId: string,
  ): void {
    if (context.rhPermission === RH_MANAGEMENT_PERMISSION) return;
    if (context.rhPermission === RH_SELF_SERVICE_PERMISSION && actorId === targetId) return;
    throw new ServiceError(404, "Colaborador não encontrado.");
  }

  private async updateScopedUser(
    target: DossierRow,
    organizationId: string,
    data: Prisma.UserUpdateManyMutationInput,
  ): Promise<void> {
    const result = await prismaClient.user.updateMany({
      where: {
        AND: [{ id: target.id }, organizationScope(organizationId), { version: target.version }],
      },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ServiceError(
        409,
        "O cadastro foi alterado por outra operação. Recarregue e tente novamente.",
      );
    }
  }
}

export { EmployeeDossierService };
