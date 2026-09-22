import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwordHash.js";

const ARGON2ID_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$dS0wPBAUPX/qYBGOMitPRw$6pkSNGexYumsTctHxTFdkGj/DzFIduoI+AqkAjvWO34";
const BCRYPT_HASH = "$2a$08$I6U8jb5KFT/FiqzpOrDcc.ofpgiWNATR.eS0WEruVrmYuyF.UwhUu";
const BCRYPT_MODERN_PREFIX_HASH = "$2b$08$I6U8jb5KFT/FiqzpOrDcc.ofpgiWNATR.eS0WEruVrmYuyF.UwhUu";

describe("Worker password hash adapter", () => {
  it("verifies canonical Argon2id hashes", async () => {
    await expect(verifyPassword("secret", ARGON2ID_HASH)).resolves.toBe(true);
    await expect(verifyPassword("wrong", ARGON2ID_HASH)).resolves.toBe(false);
  });

  it("verifies legacy bcrypt hashes", async () => {
    await expect(verifyPassword("secret", BCRYPT_HASH)).resolves.toBe(true);
    await expect(verifyPassword("secret", BCRYPT_MODERN_PREFIX_HASH)).resolves.toBe(true);
    await expect(verifyPassword("wrong", BCRYPT_HASH)).resolves.toBe(false);
  });

  it("creates a canonical Argon2id hash", async () => {
    await expect(hashPassword("secret")).resolves.toMatch(/^\$argon2id\$v=19\$/u);
  });
});
