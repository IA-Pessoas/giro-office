import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(relativePath) {
  try {
    return await readFile(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function runTest(name, test) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const [authContextSource, platformGuardSource, platformLoginSource] = await Promise.all([
  source("../../context/AuthContext.tsx"),
  source("./utils/canSSRPlatformAdmin.ts"),
  source("../../pages/super-admin/login.tsx"),
]);
const platformSources = `${authContextSource}\n${platformGuardSource}\n${platformLoginSource}`;

await runTest("platform session is derived from server identity without readable credentials", () => {
  assert.match(authContextSource, /signInPlatform/);
  assert.match(authContextSource, /api\.post\("\/platform\/session"/);
  assert.match(authContextSource, /api\.post\("\/platform\/session\/refresh"/);
  assert.match(authContextSource, /api\.delete\("\/platform\/session"/);
  assert.match(authContextSource, /auth_kind/);
  assert.match(authContextSource, /platform_role/);
  assert.match(platformLoginSource, /signInPlatform/);
  assert.match(platformGuardSource, /setupAPIClient\(ctx\)/);
  assert.match(platformGuardSource, /\.get\("\/platform\/me"\)/);
  assert.match(platformGuardSource, /destination:\s*["']\/super-admin\/login["']/);
  assert.doesNotMatch(platformGuardSource, /cw\.session|parseCookies/);
  assert.doesNotMatch(
    platformSources,
    /cw\.token|jwtDecode|Authorization|Bearer|localStorage|sessionStorage/,
  );
  assert.doesNotMatch(platformLoginSource, /setCookie|destroyCookie/);
});
