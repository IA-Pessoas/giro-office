import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildHookPlan,
  buildPrePushTurboConfig,
  classifyChangedFiles,
  parsePrePushInput,
  resolvePrePushChangedFiles,
  runCommands,
} from "./git-hook-scope.mjs";

describe("classifyChangedFiles", () => {
  it("treats package changes as affected, deixando o grafo do turbo decidir", () => {
    const packagePaths = [
      "app/src/x.tsx",
      "services/user-service/src/x.ts",
      // shared e packages/api têm dependentes declarados: o turbo seleciona quem depende.
      "shared/src/x.ts",
      "packages/api/src/x.ts",
    ];

    for (const filePath of packagePaths) {
      assert.deepEqual(classifyChangedFiles([filePath]), {
        mode: "affected",
        reason: "workspace-packages",
      });
    }
  });

  it("keeps paths outside the package graph global", () => {
    const globalPaths = [
      // infra é pacote do workspace, mas ninguém o declara como dependência.
      "infra/prisma/schema.prisma",
      "scripts/build.mjs",
      ".github/workflows/ci.yml",
      "docker/Dockerfile",
      "package.json",
      "pnpm-lock.yaml",
      "turbo.json",
      "biome.json",
    ];

    for (const filePath of globalPaths) {
      assert.deepEqual(classifyChangedFiles([filePath]), {
        mode: "global",
        reason: "global-impact",
      });
    }
  });

  it("prefers global when a change mixes package and infrastructure paths", () => {
    assert.deepEqual(classifyChangedFiles(["app/src/x.tsx", "pnpm-lock.yaml"]), {
      mode: "global",
      reason: "global-impact",
    });
  });

  it("skips docs-only changes", () => {
    assert.deepEqual(classifyChangedFiles(["docs/hooks.md", "README.md"]), {
      mode: "skip",
      reason: "docs-only",
    });
  });
});

describe("pre-push Turbo task graph", () => {
  it("runs source tests without a service build and preserves library and browser prerequisites", (t) => {
    const repoRoot = fileURLToPath(new URL("../", import.meta.url));
    const directory = mkdtempSync(path.join(tmpdir(), "git-hook-turbo-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const configPath = path.join(directory, "turbo.json");
    const rootConfig = JSON.parse(readFileSync(path.join(repoRoot, "turbo.json"), "utf8"));
    writeFileSync(configPath, JSON.stringify(buildPrePushTurboConfig(rootConfig)));

    const plan = (config) => {
      const result = spawnSync(
        process.execPath,
        [
          path.join(repoRoot, "node_modules/turbo/bin/turbo"),
          "run",
          "test",
          "--filter=@workspace/client-service",
          "--filter=@workspace/app",
          `--root-turbo-json=${config}`,
          "--dry-run=json",
        ],
        { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout).tasks;
    };

    const original = plan(path.join(repoRoot, "turbo.json"));
    assert.ok(original.some((task) => task.taskId === "@workspace/client-service#build"));

    const optimized = plan(configPath);
    assert.deepEqual(
      optimized
        .filter((task) => task.task === "build")
        .map((task) => task.taskId)
        .sort(),
      ["@workspace/api#build", "@workspace/app#build", "@workspace/shared#build"],
    );
    assert.deepEqual(
      optimized
        .filter((task) => task.task === "test")
        .map((task) => task.taskId)
        .sort(),
      ["@workspace/app#test", "@workspace/client-service#test"],
    );
    assert.ok(
      optimized
        .find((task) => task.taskId === "@workspace/client-service#test")
        .dependencies.includes("@workspace/shared#build"),
    );
    assert.ok(
      optimized
        .find((task) => task.taskId === "@workspace/app#test")
        .dependencies.includes("@workspace/app#build"),
    );
  });
});

describe("buildHookPlan", () => {
  it("filters by the affected graph from the pushed base", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["app/src/x.tsx"]), ["abc123"]), [
      [
        "pnpm",
        [
          "exec",
          "turbo",
          "run",
          "check",
          "typecheck",
          "--filter=...[abc123]",
          "--output-logs=new-only",
        ],
      ],
      [
        "pnpm",
        [
          "exec",
          "turbo",
          "run",
          "test",
          "--root-turbo-json=.turbo/git-hooks/turbo.pre-push.json",
          "--filter=...[abc123]",
          "--output-logs=new-only",
        ],
      ],
    ]);
  });

  it("carries one filter per pushed ref", () => {
    assert.deepEqual(
      buildHookPlan(classifyChangedFiles(["services/user-service/src/x.ts"]), ["abc123", "def456"]),
      [
        [
          "pnpm",
          [
            "exec",
            "turbo",
            "run",
            "check",
            "typecheck",
            "--filter=...[abc123]",
            "--filter=...[def456]",
            "--output-logs=new-only",
          ],
        ],
        [
          "pnpm",
          [
            "exec",
            "turbo",
            "run",
            "test",
            "--root-turbo-json=.turbo/git-hooks/turbo.pre-push.json",
            "--filter=...[abc123]",
            "--filter=...[def456]",
            "--output-logs=new-only",
          ],
        ],
      ],
    );
  });

  it("falls back to the global sequence when there is no base to diff against", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["app/src/x.tsx"]), []), [
      ["pnpm", ["audit:ci"]],
      ["pnpm", ["check"]],
      ["pnpm", ["typecheck"]],
      ["pnpm", ["test"]],
    ]);
  });

  it("keeps root tests and QA without rebuilding every service for known global changes", () => {
    const files = ["infra/prisma/schema.prisma"];
    assert.deepEqual(buildHookPlan(classifyChangedFiles(files), ["abc"], { changedFiles: files }), [
      ["pnpm", ["check"]],
      ["pnpm", ["typecheck"]],
      ["pnpm", ["test:scripts"]],
      [
        "pnpm",
        [
          "exec",
          "turbo",
          "run",
          "test",
          "--root-turbo-json=.turbo/git-hooks/turbo.pre-push.json",
          "--output-logs=new-only",
        ],
      ],
      ["pnpm", ["qa:integracao"]],
    ]);
  });

  it("audits dependency changes even inside an affected package", () => {
    const files = ["services/user-service/package.json"];
    const commands = buildHookPlan(classifyChangedFiles(files), ["abc"], { changedFiles: files });
    assert.deepEqual(commands[0], ["pnpm", ["audit:ci"]]);
  });

  it("does not contact the dependency registry for code-only pushes", () => {
    const files = ["services/user-service/src/server.ts"];
    const commands = buildHookPlan(classifyChangedFiles(files), ["abc"], { changedFiles: files });
    assert.equal(
      commands.some(([, args]) => args.includes("audit:ci")),
      false,
    );
    assert.equal(commands.filter(([, args]) => args.includes("test")).length, 1);
  });

  it("allows explicitly running all original gates even without changed files", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles([]), [], { full: true }), [
      ["pnpm", ["audit:ci"]],
      ["pnpm", ["check"]],
      ["pnpm", ["typecheck"]],
      ["pnpm", ["test"]],
    ]);
  });

  it("skips every command for docs-only changes", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["docs/x.md"]), ["abc"]), []);
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
      bases: [],
      forceGlobal: true,
      reason: "new-branch-without-origin-develop",
    });
  });

  it("uses the remote oid as base for a branch that already exists", () => {
    const git = {
      run(args) {
        if (args[0] === "diff") return "services/user-service/src/x.ts\n";
        throw new Error(`Unexpected git call: ${args.join(" ")}`);
      },
    };

    assert.deepEqual(resolvePrePushChangedFiles("refs/heads/f abc123 refs/heads/f def456\n", git), {
      files: ["services/user-service/src/x.ts"],
      bases: ["def456"],
      forceGlobal: false,
      reason: "pre-push-refs",
    });
  });

  it("uses the merge-base with origin/develop as base for a new branch", () => {
    const git = {
      run(args) {
        if (args[0] === "merge-base") return "base789";
        if (args[0] === "diff") return "app/src/x.tsx\n";
        throw new Error(`Unexpected git call: ${args.join(" ")}`);
      },
    };

    assert.deepEqual(
      resolvePrePushChangedFiles(
        "refs/heads/f abc123 refs/heads/f 0000000000000000000000000000000000000000\n",
        git,
      ),
      {
        files: ["app/src/x.tsx"],
        bases: ["base789"],
        forceGlobal: false,
        reason: "pre-push-refs",
      },
    );
  });
});

describe("runCommands", () => {
  it("falls back to corepack when pnpm is not installed as a direct executable", () => {
    const calls = [];
    const fakeSpawn = (command, args, options = {}) => {
      calls.push([command, args]);

      if (command === "pnpm") {
        return {
          status: null,
          error: { code: "ENOENT" },
        };
      }

      assert.match(options.env.PATH, /git-hook-pnpm-/);
      return { status: 0 };
    };

    assert.equal(runCommands([["pnpm", ["audit:ci"]]], fakeSpawn, {}, "win32"), 0);
    assert.deepEqual(calls, [
      ["pnpm", ["audit:ci"]],
      ["cmd.exe", ["/d", "/s", "/c", "corepack", "pnpm", "audit:ci"]],
    ]);
  });
});
