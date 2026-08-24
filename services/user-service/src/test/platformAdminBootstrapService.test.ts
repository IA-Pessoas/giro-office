import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootstrapPlatformAdmin } from "../services/platformAdminBootstrapService.js";

const repository = {
  findByEmail: vi.fn(),
  create: vi.fn(),
};

const validInput = {
  name: "Platform Administrator",
  email: "admin@example.com",
  password: "mH9VtK2qR7xP4cN8wY5sL1dF6gJ3bA0uE_zI-oQkCrs",
};

describe("bootstrapPlatformAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByEmail.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: "platform-user-1", email: validInput.email });
  });

  it("creates one active Argon2id super admin", async () => {
    const result = await bootstrapPlatformAdmin(validInput, repository);

    expect(result).toEqual({ id: "platform-user-1", email: validInput.email, created: true });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: validInput.name,
        email: validInput.email,
        password: expect.stringMatching(/^\$argon2id\$/),
        platform_role: "super_admin",
        status: "active",
        session_version: 0,
      }),
    );
  });

  it("never overwrites an existing platform admin", async () => {
    repository.findByEmail.mockResolvedValue({ id: "existing", email: validInput.email });

    await expect(bootstrapPlatformAdmin(validInput, repository)).rejects.toMatchObject({
      statusCode: 409,
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

  it.each([
    "aaaaaaaaaaaaaaaa",
    "qwertyuiopasdfgh",
    "abcdefghijklmnop",
    "9876543210987654",
    "admin123admin123",
    "letmeinletmein12",
    "iloveyouiloveyou",
  ])("rejects a trivial platform password: %s", async (password) => {
    await expect(bootstrapPlatformAdmin({ ...validInput, password }, repository)).rejects.toThrow(
      /muito comum/i,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
});
