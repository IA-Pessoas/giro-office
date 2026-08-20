import {
  ACTIVE_MODULE_KEYS,
  type AuthUserType,
  error as logError,
  type ModulePermissionKey,
  type ModulePermissions,
  normalizeModulePermissions,
  ServiceError,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import type { UserAuditRecorder } from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { hashPassword } from "../security/passwordHashService.js";
import { PermissionService } from "./permissionService.js";

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  login: true,
  permission: true,
  status: true,
  department_id: true,
  photo_url: true,
  joined_at: true,
  organization_id: true,
  type: true,
  first_owner_flag: true,
  permission_id: true,
} as const;

const USER_CREATE_SELECT = {
  ...USER_PUBLIC_SELECT,
  organization_id: true,
  type: true,
  first_owner_flag: true,
  permission_id: true,
} as const;

const DEFAULT_NON_OWNER_PERMISSION = 1;
const OWNER_GLOBAL_PERMISSION = 2;
const MAX_MODULE_PERMISSION = 3;
const SELF_SERVICE_PERMISSION = 1;
const MODULE_FIELDS = [...ACTIVE_MODULE_KEYS] as const;
type ModuleField = ModulePermissionKey;
type ModulePatch = Partial<Record<ModuleField, number>>;

const AUDITABLE_USER_FIELDS = [
  "name",
  "login",
  "department_id",
  "permission",
  "status",
  "photo_url",
  "organization_id",
  "type",
  "first_owner_flag",
] as const;

const MAX_MODULES = Object.fromEntries(
  MODULE_FIELDS.map((field) => [field, MAX_MODULE_PERMISSION]),
) as Record<ModuleField, number>;
const EMPTY_MODULES = Object.fromEntries(MODULE_FIELDS.map((field) => [field, 0])) as Record<
  ModuleField,
  0
>;
const DEPARTMENT_MODULE_ALIASES: Record<string, ModuleField> = {
  certificado: "certificado",
  comercial: "comercial",
  contabil: "contabil",
  contabilidade: "contabil",
  financeiro: "financeiro",
  fiscal: "fiscal",
  integracao: "integracao",
  integracao_de_clientes: "integracao",
  marketing: "marketing",
  parcelamento: "parcelamento",
  pessoal: "pessoal",
  departamento_pessoal: "pessoal",
  regularize: "regularize",
  rh: "rh",
  recursos_humanos: "rh",
  tecnologia: "ti",
  ti: "ti",
  triagem: "triagem",
};

interface CreateUserInput {
  name: string;
  login: string;
  password: string;
  department_id: string;
  permission: number;
  status?: string;
  photo_url?: string;
  invited_by?: string;
  organization_id?: string;
  type?: AuthUserType;
  first_owner_flag?: boolean;
  modules?: Record<string, number>;
}

interface UpdateUserInput {
  name?: string;
  login?: string;
  password?: string;
  department_id?: string;
  permission?: number;
  status?: string;
  photo_url?: string | null;
  organization_id?: string | null;
  type?: AuthUserType | null;
  first_owner_flag?: boolean;
  modules?: Record<string, number>;
}

interface ListUsersParams {
  skip?: number;
  take?: number;
  organizationId: string;
}

interface DepartmentAccessContext {
  id: string;
  name: string | null;
}

type UserPublicRow = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;
type UserCreateRow = Prisma.UserGetPayload<{ select: typeof USER_CREATE_SELECT }>;
type UserSessionRow = UserPublicRow & { modules: ModulePermissions };

function userOrganizationWhere(id: string, organizationId: string): Prisma.UserWhereInput {
  return {
    id,
    OR: [
      { organization_id: organizationId },
      { organization_id: null, department: { organization_id: organizationId } },
    ],
  };
}

function normalizeUserOrganization<T extends { organization_id: string | null }>(
  user: T,
  organizationId: string,
): Omit<T, "organization_id"> & { organization_id: string } {
  return {
    ...user,
    organization_id: user.organization_id ?? organizationId,
  };
}

function normalizeDepartmentName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveDepartmentModuleKey(departmentName: string | null | undefined): ModuleField | null {
  const normalizedName = normalizeDepartmentName(departmentName);
  return DEPARTMENT_MODULE_ALIASES[normalizedName] ?? null;
}

function normalizeUserType(value: unknown): AuthUserType | null {
  return value === "owner" || value === "admin" || value === "user" ? value : null;
}

function pickKnownModules(modules: Record<string, number> | undefined): ModulePatch {
  const modulePatch: ModulePatch = {};

  if (!modules) {
    return modulePatch;
  }

  for (const moduleField of MODULE_FIELDS) {
    if (modules[moduleField] !== undefined) {
      modulePatch[moduleField] = modules[moduleField];
    }
  }

  return modulePatch;
}

function hasModulePatch(modulePatch: ModulePatch): boolean {
  return Object.keys(modulePatch).length > 0;
}

function pickUserAuditFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    AUDITABLE_USER_FIELDS.filter((field) => field in value).map((field) => [field, value[field]]),
  );
}

function buildUserAuditChanges(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const previousSafe = pickUserAuditFields(previous);
  const nextSafe = pickUserAuditFields(next);
  const changes: Record<string, unknown> = {};

  for (const field of AUDITABLE_USER_FIELDS) {
    if (previousSafe[field] !== nextSafe[field]) {
      changes[field] = { previous: previousSafe[field], next: nextSafe[field] };
    }
  }

  return changes;
}

function normalizePermissionForType(type: AuthUserType | null, permission: number): number {
  if (type === "owner") {
    return OWNER_GLOBAL_PERMISSION;
  }

  if (type === "admin" && permission >= OWNER_GLOBAL_PERMISSION) {
    return DEFAULT_NON_OWNER_PERMISSION;
  }

  return permission;
}

function withDepartmentAdminModule(
  modules: ModulePatch,
  type: AuthUserType | null,
  departmentName: string | null | undefined,
): ModulePatch {
  if (type !== "admin") {
    return modules;
  }

  const departmentModule = resolveDepartmentModuleKey(departmentName);
  if (!departmentModule) {
    return modules;
  }

  return {
    ...modules,
    [departmentModule]: MAX_MODULE_PERMISSION,
  };
}

function withDefaultSelfServiceModules(modules: ModulePatch, permission: number): ModulePatch {
  if (permission < DEFAULT_NON_OWNER_PERMISSION) {
    return modules;
  }

  return {
    ...modules,
    rh:
      typeof modules.rh === "number" && modules.rh >= SELF_SERVICE_PERMISSION
        ? modules.rh
        : SELF_SERVICE_PERMISSION,
    ti:
      typeof modules.ti === "number" && modules.ti >= SELF_SERVICE_PERMISSION
        ? modules.ti
        : SELF_SERVICE_PERMISSION,
  };
}

class UserService {
  constructor(private readonly audit?: UserAuditRecorder) {}

  async list({ skip = 0, take = 20, organizationId }: ListUsersParams): Promise<{
    users: UserPublicRow[];
    total: number;
    skip: number;
    take: number;
  }> {
    const where = { organization_id: organizationId };
    const [users, total] = await Promise.all([
      prismaClient.user.findMany({
        where,
        select: USER_PUBLIC_SELECT,
        skip,
        take,
        orderBy: { name: "asc" },
      }),
      prismaClient.user.count({ where }),
    ]);

    return { users, total, skip, take };
  }

  async getById(id: string, organizationId: string): Promise<UserPublicRow> {
    const user = await prismaClient.user.findFirst({
      where: userOrganizationWhere(id, organizationId),
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new ServiceError(404, "Usuario nao encontrado.");
    }

    return normalizeUserOrganization(user, organizationId);
  }

  async getByIdWithModules(id: string, organizationId: string): Promise<UserSessionRow> {
    const user = await this.getById(id, organizationId);
    let permission: unknown;

    try {
      permission = await new PermissionService().getByUserId(id, undefined, organizationId);
    } catch (err: unknown) {
      if (!(err instanceof ServiceError) || err.statusCode !== 404) {
        throw err;
      }
    }

    return {
      ...user,
      modules: normalizeModulePermissions(permission),
    };
  }

  async create(
    data: CreateUserInput,
    actorUserId?: string,
  ): Promise<UserPublicRow | UserCreateRow> {
    const department = data.organization_id
      ? await this.#requireDepartmentInOrganization(data.department_id, data.organization_id)
      : null;
    const normalizedType = normalizeUserType(data.type);
    const normalizedPermission = normalizePermissionForType(normalizedType, data.permission);
    const modulesToApply =
      normalizedType === "owner"
        ? MAX_MODULES
        : withDefaultSelfServiceModules(
            withDepartmentAdminModule(
              pickKnownModules(data.modules),
              normalizedType,
              department?.name ?? null,
            ),
            normalizedPermission,
          );

    const passwordHash = await hashPassword(data.password);

    try {
      const user = await prismaClient.user.create({
        data: {
          name: data.name,
          login: data.login,
          password: passwordHash,
          department_id: data.department_id,
          permission: normalizedPermission,
          status: data.status ?? "active",
          photo_url: data.photo_url,
          invited_by: data.invited_by,
          organization_id: data.organization_id ?? null,
          type: normalizedType,
          first_owner_flag: data.first_owner_flag ?? false,
        },
        select: data.organization_id ? USER_CREATE_SELECT : USER_PUBLIC_SELECT,
      });

      if (data.organization_id) {
        try {
          const permissionService = new PermissionService(this.audit);
          const permission = await permissionService.create(user.id, data.organization_id);

          if (hasModulePatch(modulesToApply)) {
            if (actorUserId) {
              await permissionService.update(user.id, modulesToApply, data.organization_id, {
                actorUserId,
              });
            } else {
              await permissionService.update(user.id, modulesToApply, data.organization_id);
            }
          }

          await prismaClient.user.update({
            where: { id: user.id },
            data: { permission_id: permission.id },
          });

          const createdUser = {
            ...user,
            permission_id: permission.id,
          };
          if (this.audit && actorUserId) {
            this.#recordAudit({
              actorUserId,
              organizationId: data.organization_id,
              action: "CREATE",
              referring: "user",
              referringId: user.id,
              changes: { next: pickUserAuditFields(createdUser) },
              outcome: "success",
            });
          }

          return createdUser;
        } catch (permErr: unknown) {
          logError("Erro ao criar/atualizar permissao no create de usuario", { err: permErr });
          throw new ServiceError(500, "Erro ao criar permissao para o usuario.", permErr);
        }
      }

      return user;
    } catch (err: unknown) {
      const isUniqueViolation =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login ja cadastrado.");
      }
      logError("Erro ao criar usuario", { err });
      throw err;
    }
  }

  async update(
    id: string,
    data: UpdateUserInput,
    organizationId: string,
    actorUserId?: string,
    action = "UPDATE",
  ): Promise<UserPublicRow> {
    const existingUser = await prismaClient.user.findFirst({
      where: userOrganizationWhere(id, organizationId),
      select: { ...USER_PUBLIC_SELECT, permission_id: true },
    });

    if (!existingUser) {
      throw new ServiceError(404, "Usuario nao encontrado.");
    }

    const updateData: Record<string, unknown> = {};
    let departmentForAccess: DepartmentAccessContext | null = null;
    const currentType = normalizeUserType(existingUser.type);
    const requestedType = data.type !== undefined ? normalizeUserType(data.type) : currentType;

    if (data.name !== undefined) updateData.name = data.name;
    if (data.login !== undefined) updateData.login = data.login;
    if (data.department_id !== undefined) {
      departmentForAccess = await this.#requireDepartmentInOrganization(
        data.department_id,
        organizationId,
      );
      updateData.department_id = data.department_id;
    }
    if (data.permission !== undefined) {
      updateData.permission = normalizePermissionForType(requestedType, data.permission);
    } else if (data.type !== undefined && requestedType === "owner") {
      updateData.permission = OWNER_GLOBAL_PERMISSION;
    } else if (
      data.type !== undefined &&
      requestedType === "admin" &&
      typeof existingUser.permission === "number" &&
      existingUser.permission >= OWNER_GLOBAL_PERMISSION
    ) {
      updateData.permission = DEFAULT_NON_OWNER_PERMISSION;
    } else if (
      data.type === "user" &&
      typeof existingUser.permission === "number" &&
      existingUser.permission >= OWNER_GLOBAL_PERMISSION
    ) {
      updateData.permission = DEFAULT_NON_OWNER_PERMISSION;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.photo_url !== undefined) updateData.photo_url = data.photo_url;
    if (data.organization_id !== undefined) {
      if (data.organization_id !== organizationId) {
        throw new ServiceError(403, "Organizacao da requisicao nao confere.");
      }
      updateData.organization_id = data.organization_id;
    }
    if (data.type !== undefined) updateData.type = requestedType;
    if (data.first_owner_flag !== undefined) updateData.first_owner_flag = data.first_owner_flag;

    if (data.password !== undefined) {
      updateData.password = await hashPassword(data.password);
    }

    let modulesToApply: ModulePatch | null = null;
    if (requestedType === "owner" && (data.type === "owner" || data.first_owner_flag === true)) {
      modulesToApply = MAX_MODULES;
    } else if (data.modules !== undefined) {
      modulesToApply = pickKnownModules(data.modules);
    }

    if (
      requestedType === "admin" &&
      (data.type !== undefined || data.permission !== undefined || data.department_id !== undefined)
    ) {
      departmentForAccess ??= await this.#requireDepartmentInOrganization(
        data.department_id ?? existingUser.department_id,
        organizationId,
      );
      modulesToApply = withDepartmentAdminModule(
        modulesToApply ?? {},
        requestedType,
        departmentForAccess.name,
      );
    }

    const shouldClearModules =
      data.modules === undefined &&
      (data.type === "user" ||
        (data.permission !== undefined &&
          data.permission <= DEFAULT_NON_OWNER_PERMISSION &&
          requestedType !== "admin"));
    if (shouldClearModules) {
      modulesToApply = EMPTY_MODULES;
    }

    const effectivePermission =
      typeof updateData.permission === "number"
        ? updateData.permission
        : typeof existingUser.permission === "number"
          ? normalizePermissionForType(requestedType, existingUser.permission)
          : 0;
    const shouldProvisionSelfService =
      modulesToApply === null &&
      data.modules === undefined &&
      (data.permission !== undefined || data.type !== undefined) &&
      requestedType !== "owner" &&
      effectivePermission >= DEFAULT_NON_OWNER_PERMISSION;
    if (shouldProvisionSelfService) {
      modulesToApply = {};
    }

    if (modulesToApply) {
      modulesToApply = withDefaultSelfServiceModules(modulesToApply, effectivePermission);
    }

    try {
      const user = await prismaClient.user.update({
        where: { id },
        data: updateData,
        select: USER_PUBLIC_SELECT,
      });

      if (modulesToApply && hasModulePatch(modulesToApply)) {
        if (!existingUser.permission_id) {
          logError("Usuario sem permissao: nao e possivel atualizar modules", { userId: id });
          throw new ServiceError(400, "Usuario nao possui permissao. Crie a permissao primeiro.");
        }
        const permissionService = new PermissionService(this.audit);
        if (actorUserId) {
          await permissionService.update(id, modulesToApply, organizationId, { actorUserId });
        } else {
          await permissionService.update(id, modulesToApply, organizationId);
        }
      }

      const normalizedUser = normalizeUserOrganization(user, organizationId);
      if (this.audit && actorUserId) {
        this.#recordAudit({
          actorUserId,
          organizationId,
          action,
          referring: "user",
          referringId: id,
          changes: buildUserAuditChanges(existingUser, normalizedUser),
          outcome: "success",
        });
      }

      return normalizedUser;
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      const isUniqueViolation =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login ja cadastrado.");
      }
      logError("Erro ao atualizar usuario", { err });
      throw err;
    }
  }

  #recordAudit(params: Parameters<UserAuditRecorder>[0]): void {
    try {
      void Promise.resolve(this.audit?.(params)).catch((err: unknown) => {
        logError("Erro ao registrar auditoria de usuario", { err });
      });
    } catch (err: unknown) {
      logError("Erro ao registrar auditoria de usuario", { err });
    }
  }

  async delete(id: string, organizationId: string, actorUserId?: string): Promise<void> {
    const existingUser = await this.getById(id, organizationId);

    try {
      await prismaClient.user.update({
        where: { id },
        data: { status: "inactive" },
      });
      if (this.audit && actorUserId) {
        this.#recordAudit({
          actorUserId,
          organizationId,
          action: "DEACTIVATE",
          referring: "user",
          referringId: id,
          changes: buildUserAuditChanges(existingUser, { ...existingUser, status: "inactive" }),
          outcome: "success",
        });
      }
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === "P2003") {
        throw new ServiceError(409, "Nao e possivel desativar: usuario possui vinculos.");
      }
      logError("Erro ao desativar usuario", { err });
      throw new ServiceError(500, "Erro ao desativar usuario.", err);
    }
  }

  async #requireDepartmentInOrganization(
    departmentId: string,
    organizationId: string,
  ): Promise<DepartmentAccessContext> {
    const department = await prismaClient.department.findFirst({
      where: { id: departmentId, organization_id: organizationId },
      select: { id: true, name: true },
    });

    if (!department) {
      throw new ServiceError(404, "Departamento nao encontrado.");
    }

    return {
      id: department.id,
      name: department.name ?? null,
    };
  }
}

export { UserService };
