import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const appUrl = new URL("../../", import.meta.url);
const appRootPath =
  appUrl.pathname.startsWith("/") && /^[A-Za-z]:/.test(appUrl.pathname.slice(1))
    ? appUrl.pathname.slice(1)
    : appUrl.pathname;
const srcRootPath = join(appRootPath, "src");
const appSource = await readFile(join(srcRootPath, "pages", "_app.tsx"), "utf8");
const administracaoSource = await readFile(
  join(srcRootPath, "shared", "components", "newLayout", "Administracao.tsx"),
  "utf8",
);

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }

    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function getFunctionSource(source, functionName) {
  const start = source.indexOf(`const ${functionName} =`);
  assert.notEqual(start, -1);

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1);

  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        const end = source.indexOf(";", index);
        assert.notEqual(end, -1);

        return source.slice(start, end + 1);
      }
    }
  }

  assert.fail(`Function ${functionName} was not closed`);
}

await runTest("query client defines shared cache defaults", () => {
  assert.match(appSource, /new QueryClient\(\{/);
  assert.match(appSource, /staleTime: 60_000,/);
  assert.match(appSource, /gcTime: 5 \* 60_000,/);
  assert.match(appSource, /refetchOnWindowFocus: false,/);
  assert.match(appSource, /retry: 1,/);
});

await runTest("source files do not repeat refetchOnWindowFocus false outside _app", async () => {
  const files = await collectSourceFiles(srcRootPath);
  const offenders = [];

  for (const file of files) {
    const relativePath = relative(appRootPath, file).replaceAll("\\", "/");

    if (relativePath === "src/pages/_app.tsx") {
      continue;
    }

    const source = await readFile(file, "utf8");

    if (source.includes("refetchOnWindowFocus: false")) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(offenders, []);
});

await runTest("administracao defines user list cache keys", () => {
  assert.match(administracaoSource, /const adminUsersRootQueryKey = \["admin-users"\] as const;/);
  assert.match(
    administracaoSource,
    /const adminUsersSummaryRootQueryKey = \["admin-users-summary"\] as const;/,
  );
  assert.match(
    administracaoSource,
    /const adminUsersQueryKey = \(status: AdminUserStatus\) => \[\.\.\.adminUsersRootQueryKey, status\] as const;/,
  );
});

await runTest("administracao invalidates user lists after user mutations", () => {
  assert.equal(administracaoSource.includes("refetch: refetchUsers"), false);
  assert.equal(administracaoSource.includes("refetchUsers"), false);
  assert.match(administracaoSource, /const invalidateAdminUserLists = \(\) =>\s*Promise\.all\(/s);
  assert.match(administracaoSource, /queryClient\.invalidateQueries\(\{ queryKey: adminUsersRootQueryKey \}\)/);
  assert.match(
    administracaoSource,
    /queryClient\.invalidateQueries\(\{ queryKey: adminUsersSummaryRootQueryKey \}\)/,
  );
  assert.match(getFunctionSource(administracaoSource, "handleUserCreated"), /void invalidateAdminUserLists\(\);/);
  assert.match(administracaoSource, /onUserUpdated=\{\(\) => invalidateAdminUserLists\(\)\}/);
});

await runTest("explicit retry refetch paths are preserved", () => {
  assert.match(administracaoSource, /refetch: refetchDepartments,/);
  assert.match(administracaoSource, /refetch: refetchPermissionUsers,/);
  assert.match(getFunctionSource(administracaoSource, "handleOpenCreateModal"), /void refetchDepartments\(\);/);
  assert.match(getFunctionSource(administracaoSource, "handleRetryDepartments"), /void refetchDepartments\(\);/);
  assert.match(administracaoSource, /onClick=\{\(\) => void refetchPermissionUsers\(\)\}/);
  assert.match(administracaoSource, /onClick=\{\(\) => void permissionQuery\.refetch\(\)\}/);
});

await runTest("permission save keeps precise cache update without manual list refetch", () => {
  const handleSavePermissionsSource = getFunctionSource(administracaoSource, "handleSavePermissions");

  assert.match(
    handleSavePermissionsSource,
    /queryClient\.setQueryData\(\["admin", "permissions", selectedPermissionUserId\], \{/,
  );
  assert.equal(handleSavePermissionsSource.includes("refetchPermissionUsers"), false);
});
