import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyPassword } from "../security/passwordHashService.js";
import { bootstrapPlatformAdmin } from "../services/platformAdminBootstrapService.js";

const repository = {
  findByEmail: vi.fn(),
  create: vi.fn(),
};

const validInput = {
  name: "Platform Administrator",
  email: "admin@example.com",
  password: "a-long-test-only-password",
};

describe("bootstrapPlatformAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByEmail.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: "platform-user-1", email: validInput.email });
  });

  it("creates one active super admin with the supplied password and impersonation permission", async () => {
    const result = await bootstrapPlatformAdmin(validInput, repository);

    expect(result).toEqual({
      id: "platform-user-1",
      email: validInput.email,
      created: true,
    });

    const [createdAdmin] = repository.create.mock.calls[0];
    expect(createdAdmin).toMatchObject({
      name: validInput.name,
      email: validInput.email,
      password: expect.stringMatching(/^\$argon2id\$/),
      platform_role: "super_admin",
      status: "active",
      session_version: 0,
      can_impersonate: true,
    });
    expect(await verifyPassword(validInput.password, createdAdmin.password)).toEqual({
      valid: true,
      needsRehash: false,
    });
  });

  it("does nothing when the platform admin already exists", async () => {
    repository.findByEmail.mockResolvedValue({ id: "existing", email: validInput.email });

    await expect(bootstrapPlatformAdmin(validInput, repository)).resolves.toEqual({
      id: "existing",
      email: validInput.email,
      created: false,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("normalizes the email before lookup and persistence", async () => {
    repository.create.mockResolvedValue({ id: "platform-user-1", email: "admin@example.com" });

    await bootstrapPlatformAdmin({ ...validInput, email: " Admin@Example.COM " }, repository);

    expect(repository.findByEmail).toHaveBeenCalledWith("admin@example.com");
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "admin@example.com" }),
    );
  });
});
