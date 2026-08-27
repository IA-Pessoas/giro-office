import { describe, expect, it, vi } from "vitest";

const { userServiceMock } = vi.hoisted(() => ({
  userServiceMock: {
    list: vi.fn(),
    getById: vi.fn(),
    getPermissions: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updatePermissions: vi.fn(),
    delete: vi.fn(),
  },
}));

import {
  OrganizationUserManagementAdapter,
  PlatformUserManagementAdapter,
} from "../services/userManagementService.js";

describe("user management adapters", () => {
  it("organização é autoridade, mesmo quando o comando tenta informar outro tenant", async () => {
    const management = new OrganizationUserManagementAdapter(userServiceMock as never, {
      actor: { kind: "organization", userId: "actor-1" },
      organizationId: "org-1",
    });

    await management.create({
      name: "Ana",
      login: "ana",
      password: "secret",
      department_id: "dep-1",
      permission: 1,
      organization_id: "org-2",
    });

    expect(userServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1" }),
      "actor-1",
    );
  });

  it("adapter de plataforma fixa a organização resolvida fora do comando", async () => {
    const management = new PlatformUserManagementAdapter(userServiceMock as never, {
      actor: { kind: "platform", platformUserId: "platform-1" },
      organizationId: "org-1",
    });

    await management.update("user-1", { name: "Novo nome", organization_id: "org-2" });

    expect(userServiceMock.update).toHaveBeenCalledWith("user-1", { name: "Novo nome" }, "org-1");
  });
});
