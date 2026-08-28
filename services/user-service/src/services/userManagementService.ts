import type { ModulePermissions } from "@workspace/shared";

import type {
  CreateUserInput,
  ListUsersParams,
  UpdateUserInput,
  UserManagementService,
} from "./userService.js";

export interface OrganizationalUserManagementContext {
  actor: { kind: "organization"; userId: string };
  organizationId: string;
}

export interface PlatformUserManagementContext {
  actor: { kind: "platform"; platformUserId: string };
  organizationId: string;
}

export type UserManagementContext =
  | OrganizationalUserManagementContext
  | PlatformUserManagementContext;

export interface UserManagement {
  list(input?: Omit<ListUsersParams, "organizationId">): ReturnType<UserManagementService["list"]>;
  getById(id: string): ReturnType<UserManagementService["getById"]>;
  getPermissions(id: string, modulo?: string): ReturnType<UserManagementService["getPermissions"]>;
  create(input: CreateUserInput): ReturnType<UserManagementService["create"]>;
  update(
    id: string,
    input: UpdateUserInput,
    action?: string,
  ): ReturnType<UserManagementService["update"]>;
  updatePermissions(
    id: string,
    modules: Partial<ModulePermissions>,
  ): ReturnType<UserManagementService["updatePermissions"]>;
  delete(id: string): ReturnType<UserManagementService["delete"]>;
}

export class OrganizationUserManagementAdapter implements UserManagement {
  constructor(
    private readonly userService: UserManagementService,
    private readonly context: OrganizationalUserManagementContext,
  ) {}

  list(
    input: Omit<ListUsersParams, "organizationId"> = {},
  ): ReturnType<UserManagementService["list"]> {
    return this.userService.list({ ...input, organizationId: this.context.organizationId });
  }

  getById(id: string): ReturnType<UserManagementService["getById"]> {
    return this.userService.getById(id, this.context.organizationId);
  }

  getPermissions(id: string, modulo?: string): ReturnType<UserManagementService["getPermissions"]> {
    return this.userService.getPermissions(id, modulo, this.context.organizationId);
  }

  create({
    organization_id: _organizationId,
    ...input
  }: CreateUserInput): ReturnType<UserManagementService["create"]> {
    return this.userService.create(
      { ...input, organization_id: this.context.organizationId },
      this.context.actor.userId,
    );
  }

  update(
    id: string,
    { organization_id: _organizationId, ...input }: UpdateUserInput,
    action?: string,
  ): ReturnType<UserManagementService["update"]> {
    const args = [id, input, this.context.organizationId, this.context.actor.userId] as const;
    return action === undefined
      ? this.userService.update(...args)
      : this.userService.update(...args, action);
  }

  updatePermissions(
    id: string,
    modules: Partial<ModulePermissions>,
  ): ReturnType<UserManagementService["updatePermissions"]> {
    return this.userService.updatePermissions(
      id,
      modules,
      this.context.organizationId,
      this.context.actor.userId,
    );
  }

  delete(id: string): ReturnType<UserManagementService["delete"]> {
    return this.userService.delete(id, this.context.organizationId, this.context.actor.userId);
  }
}

export class PlatformUserManagementAdapter implements UserManagement {
  constructor(
    private readonly userService: UserManagementService,
    private readonly context: PlatformUserManagementContext,
  ) {}

  list(
    input: Omit<ListUsersParams, "organizationId"> = {},
  ): ReturnType<UserManagementService["list"]> {
    return this.userService.list({ ...input, organizationId: this.context.organizationId });
  }

  getById(id: string): ReturnType<UserManagementService["getById"]> {
    return this.userService.getById(id, this.context.organizationId);
  }

  getPermissions(id: string, modulo?: string): ReturnType<UserManagementService["getPermissions"]> {
    return this.userService.getPermissions(id, modulo, this.context.organizationId);
  }

  create({
    organization_id: _organizationId,
    ...input
  }: CreateUserInput): ReturnType<UserManagementService["create"]> {
    return this.userService.create({ ...input, organization_id: this.context.organizationId });
  }

  update(
    id: string,
    { organization_id: _organizationId, ...input }: UpdateUserInput,
    action?: string,
  ): ReturnType<UserManagementService["update"]> {
    const args = [id, input, this.context.organizationId] as const;
    return action === undefined
      ? this.userService.update(...args)
      : this.userService.update(...args, undefined, action);
  }

  updatePermissions(
    id: string,
    modules: Partial<ModulePermissions>,
  ): ReturnType<UserManagementService["updatePermissions"]> {
    return this.userService.updatePermissions(id, modules, this.context.organizationId);
  }

  delete(id: string): ReturnType<UserManagementService["delete"]> {
    return this.userService.delete(id, this.context.organizationId);
  }
}
