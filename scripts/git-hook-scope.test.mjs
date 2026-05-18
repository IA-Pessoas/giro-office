import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHookPlan,
  classifyChangedFiles,
  parsePrePushInput,
  resolvePrePushChangedFiles,
  runCommands,
} from "./git-hook-scope.mjs";

describe("classifyChangedFiles", () => {
  it("classifies app files as ui", () => {
    assert.deepEqual(classifyChangedFiles(["app/src/x.tsx"]), {
      mode: "scoped",
      scopes: ["ui"],
      reason: "ui",
    });
  });

  it("classifies service files as services", () => {
    assert.deepEqual(classifyChangedFiles(["services/user-service/src/x.ts"]), {
      mode: "scoped",
      scopes: ["services"],
      reason: "services",
    });
  });

  it("classifies mixed app and services files as both scopes", () => {
    assert.deepEqual(classifyChangedFiles(["app/src/x.tsx", "services/user-service/src/x.ts"]), {
      mode: "scoped",
      scopes: ["ui", "services"],
      reason: "ui+services",
    });
  });

  it("classifies shared files and root configs as global", () => {
    const globalPaths = [
      "shared/src/x.ts",
      "packages/api/src/x.ts",
      "infra/package.json",
      "package.json",
      "pnpm-lock.yaml",
      "turbo.json",
      "biome.json",
    ];

    for (const filePath of globalPaths) {
      assert.deepEqual(classifyChangedFiles([filePath]), {
        mode: "global",
        scopes: ["global"],
        reason: "global-impact",
      });
    }
  });

  it("skips docs-only changes", () => {
    assert.deepEqual(classifyChangedFiles(["docs/hooks.md", "README.md"]), {
      mode: "skip",
      scopes: [],
      reason: "docs-only",
    });
  });
});

describe("buildHookPlan", () => {
  it("builds the ui command for ui-only changes", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["app/src/x.tsx"])), [
      ["pnpm", ["exec", "turbo", "run", "typecheck", "test", "--filter=@workspace/app"]],
    ]);
  });

  it("builds the services command for services-only changes", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["services/user-service/src/x.ts"])), [
      ["pnpm", ["exec", "turbo", "run", "check", "typecheck", "test", "--filter=./services/*"]],
    ]);
  });

  it("builds the current global command sequence for global changes", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["shared/src/x.ts"])), [
      ["pnpm", ["audit:ci"]],
      ["pnpm", ["check"]],
      ["pnpm", ["typecheck"]],
      ["pnpm", ["test"]],
    ]);
  });
});

describe("parsePrePushInput", () => {
  it("parses pre-push ref lines", () => {
    assert.deepEqual(
      parsePrePushInput(
        "refs/heads/feature abc123 refs/heads/feature def456\nrefs/heads/other fed refs/heads/other cba\n",
      ),
      [
        {
          localRef: "refs/heads/feature",
          localOid: "abc123",
          remoteRef: "refs/heads/feature",
          remoteOid: "def456",
        },
        {
          localRef: "refs/heads/other",
          localOid: "fed",
          remoteRef: "refs/heads/other",
          remoteOid: "cba",
        },
      ],
    );
  });
});

describe("resolvePrePushChangedFiles", () => {
  it("falls back to global validation for a new branch without origin/develop", () => {
    const git = {
      run(args) {
        if (args[0] === "merge-base") {
          return null;
        }

        throw new Error(`Unexpected git call: ${args.join(" ")}`);
      },
    };

    const result = resolvePrePushChangedFiles(
      "refs/heads/feature abc123 refs/heads/feature 0000000000000000000000000000000000000000\n",
      git,
    );

    assert.deepEqual(result, {
      files: [],
      forceGlobal: true,
      reason: "new-branch-without-origin-develop",
    });
  });
});

describe("runCommands", () => {
  it("falls back to corepack when pnpm is not installed as a direct executable", () => {
    const calls = [];
    const fakeSpawn = (command, args) => {
      calls.push([command, args]);

      if (command === "pnpm") {
        return {
          status: null,
          error: { code: "ENOENT" },
        };
      }

      return { status: 0 };
    };

    assert.equal(runCommands([["pnpm", ["audit:ci"]]], fakeSpawn, {}, "win32"), 0);
    assert.deepEqual(calls, [
      ["pnpm", ["audit:ci"]],
      ["cmd.exe", ["/d", "/s", "/c", "corepack", "pnpm", "audit:ci"]],
    ]);
  });
});
