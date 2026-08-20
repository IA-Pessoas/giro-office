import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../security/passwordHashService.js";

describe("passwordHashService", () => {
  it("cria e valida hashes Argon2id", async () => {
    const hash = await hashPassword("secret");

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword("secret", hash)).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
    await expect(verifyPassword("wrong", hash)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("aceita bcrypt legado somente para migrá-lo após login válido", async () => {
    const legacyHash = await bcrypt.hash("secret", 8);

    await expect(verifyPassword("secret", legacyHash)).resolves.toEqual({
      valid: true,
      needsRehash: true,
    });
    await expect(verifyPassword("wrong", legacyHash)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("falha fechada para hashes malformados", async () => {
    await expect(verifyPassword("secret", "not-a-password-hash")).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });
});
