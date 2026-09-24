import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("where the runtime forbids compiling WebAssembly, like workerd", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();
    });

    it("still verifies and creates hashes", async () => {
      const forbidden = () => {
        throw new Error("WebAssembly.compile(): Wasm code generation disallowed by embedder");
      };
      vi.stubGlobal("WebAssembly", {
        ...WebAssembly,
        compile: forbidden,
        instantiate: forbidden,
        Module: forbidden,
      });
      vi.resetModules();
      const hashes = await import("./passwordHash.js");

      await expect(hashes.verifyPassword("secret", ARGON2ID_HASH)).resolves.toBe(true);
      await expect(hashes.verifyPassword("secret", BCRYPT_HASH)).resolves.toBe(true);
      const created = await hashes.hashPassword("secret");
      await expect(hashes.verifyPassword("secret", created)).resolves.toBe(true);
    });
  });
});
