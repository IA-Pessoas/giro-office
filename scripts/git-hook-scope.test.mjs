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

describe("buildHookPlan", () => {
  it("filters by the affected graph from the pushed base", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["app/src/x.tsx"]), ["abc123"]), [
      ["pnpm", ["exec", "turbo", "run", "check", "typecheck", "test", "--filter=...[abc123]"]],
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
            "test",
            "--filter=...[abc123]",
            "--filter=...[def456]",
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

  it("checks somente os arquivos alterados antes da sequência global", () => {
    assert.deepEqual(
      buildHookPlan(
        classifyChangedFiles(["infra/prisma/schema.prisma"]),
        ["abc"],
        ["infra/prisma/schema.prisma"],
      ),
      [
        ["pnpm", ["audit:ci"]],
        [
          "pnpm",
          ["exec", "biome", "check", "--files-ignore-unknown=true", "infra/prisma/schema.prisma"],
        ],
        ["pnpm", ["typecheck"]],
        ["pnpm", ["test"]],
      ],
    );
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

  it("limita a concorrência do turbo para a carga da máquina não virar vermelho falso", () => {
    const ambientes = [];
    const fakeSpawn = (_command, _args, options = {}) => {
      ambientes.push(options.env);
      return { status: 0 };
    };

    runCommands([["pnpm", ["test"]]], fakeSpawn, { PATH: "/usr/bin" }, "linux");

    assert.equal(ambientes[0].TURBO_CONCURRENCY, "50%");
    assert.equal(ambientes[0].PATH, "/usr/bin");
  });

  it("respeita TURBO_CONCURRENCY já definido no ambiente", () => {
    const ambientes = [];
    const fakeSpawn = (_command, _args, options = {}) => {
      ambientes.push(options.env);
      return { status: 0 };
    };

    runCommands([["pnpm", ["test"]]], fakeSpawn, { TURBO_CONCURRENCY: "2" }, "linux");

    assert.equal(ambientes[0].TURBO_CONCURRENCY, "2");
  });
});
