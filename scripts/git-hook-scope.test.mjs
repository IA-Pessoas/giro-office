import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildHookPlan,
  classifyChangedFiles,
  describeForcePushBlock,
  findHistoryRewrites,
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
      ["pnpm", ["test:scripts"]],
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
        ["pnpm", ["test:scripts"]],
      ],
    );
  });

  it("falls back to the global sequence when there is no base to diff against", () => {
    assert.deepEqual(buildHookPlan(classifyChangedFiles(["app/src/x.tsx"]), []), [
      ["pnpm", ["audit:ci"]],
      ["pnpm", ["check"]],
      ["pnpm", ["typecheck"]],
      ["pnpm", ["test:scripts"]],
    ]);
  });

  it("mantém as políticas de segurança nas mudanças globais, sem as suítes dos pacotes", () => {
    const files = ["infra/prisma/schema.prisma"];
    assert.deepEqual(buildHookPlan(classifyChangedFiles(files), ["abc"], { changedFiles: files }), [
      [
        "pnpm",
        [
          "exec",
          "node",
          "node_modules/@biomejs/biome/bin/biome",
          "check",
          "--files-ignore-unknown=true",
          "--no-errors-on-unmatched",
          "infra/prisma/schema.prisma",
        ],
      ],
      ["pnpm", ["typecheck"]],
      ["pnpm", ["test:scripts"]],
    ]);
  });

  // Um push que so mexe em workflow passa ao biome uma lista que ele inteira
  // ignora. Sem --no-errors-on-unmatched ele sai 1 em "No files were processed"
  // e derruba o push, embora nada esteja errado com a mudanca.
  it("nao deixa o biome falhar quando todo arquivo empurrado e do tipo que ele ignora", () => {
    const files = [".github/workflows/quality.yml"];
    const commands = buildHookPlan(classifyChangedFiles(files), ["abc"], { changedFiles: files });
    const biome = commands.find(([, args]) =>
      args.includes("node_modules/@biomejs/biome/bin/biome"),
    );

    assert.ok(biome, "esperava um comando do biome no plano");
    assert.ok(biome[1].includes("--no-errors-on-unmatched"));
  });

  it("nao passa ao biome arquivos deletados do diff", () => {
    const files = [".github/workflows/removed-from-worktree.yml"];
    const commands = buildHookPlan(classifyChangedFiles(files), ["abc"], { changedFiles: files });

    assert.deepEqual(commands[0], ["pnpm", ["check"]]);
  });

  it("divide listas grandes de arquivos do biome em comandos seguros para Windows", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "git-hook-biome-batch-"));

    try {
      const files = Array.from({ length: 500 }, (_, index) => {
        const filePath = path.join(directory, `file-${String(index).padStart(4, "0")}.ts`);
        writeFileSync(filePath, "export {};\n");
        return filePath;
      });
      const commands = buildHookPlan(classifyChangedFiles(["scripts/hook.mjs"]), ["abc"], {
        changedFiles: files,
      }).filter(([, args]) => args.includes("node_modules/@biomejs/biome/bin/biome"));

      assert.ok(commands.length > 1, "a lista deve ser dividida em mais de um processo");
      assert.deepEqual(
        commands.flatMap(([, args]) => args.slice(6)),
        files,
        "cada arquivo deve ser validado exatamente uma vez e na ordem original",
      );
      for (const [, args] of commands) {
        assert.ok(
          args.join(" ").length < 8_000,
          "cada comando deve caber com folga no limite do Windows",
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
    assert.equal(commands.filter(([, args]) => args.includes("test:scripts")).length, 1);
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

describe("bloqueio de force push", () => {
  const gitFake = (ancestralidade) => ({
    isAncestor: (ancestor, descendant) => ancestralidade[`${ancestor}->${descendant}`] ?? true,
  });

  const registro = (branch, remoteOid, localOid) => ({
    localRef: `refs/heads/${branch}`,
    localOid,
    remoteRef: `refs/heads/${branch}`,
    remoteOid,
  });

  it("não acusa quando o push é avanço normal", () => {
    const rewrites = findHistoryRewrites([registro("feature/x", "aaa", "bbb")], gitFake({}));
    assert.deepEqual(rewrites, []);
    assert.equal(describeForcePushBlock(rewrites, {}), null);
  });

  it("acusa quando o commit publicado deixaria de existir", () => {
    const rewrites = findHistoryRewrites(
      [registro("feature/x", "aaa", "bbb")],
      gitFake({ "aaa->bbb": false }),
    );

    assert.equal(rewrites.length, 1);
    assert.match(describeForcePushBlock(rewrites, {}), /reescrita de historico/);
    assert.match(describeForcePushBlock(rewrites, {}), /ALLOW_FORCE_PUSH=1/);
  });

  it("libera branch própria quando a intenção é declarada", () => {
    const rewrites = findHistoryRewrites(
      [registro("feature/x", "aaa", "bbb")],
      gitFake({ "aaa->bbb": false }),
    );

    assert.equal(describeForcePushBlock(rewrites, { ALLOW_FORCE_PUSH: "1" }), null);
  });

  it("não libera main, develop nem staging, mesmo com a intenção declarada", () => {
    for (const branch of ["main", "develop", "staging"]) {
      const rewrites = findHistoryRewrites(
        [registro(branch, "aaa", "bbb")],
        gitFake({ "aaa->bbb": false }),
      );

      assert.match(
        describeForcePushBlock(rewrites, { ALLOW_FORCE_PUSH: "1" }),
        new RegExp(`Reescrever historico de ${branch}`),
      );
    }
  });

  it("ignora criação e remoção de branch", () => {
    const criacao = registro("feature/nova", "0000000000000000000000000000000000000000", "bbb");
    const remocao = registro("feature/velha", "aaa", "0000000000000000000000000000000000000000");

    assert.deepEqual(findHistoryRewrites([criacao, remocao], gitFake({})), []);
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

  // O git sempre escreve os quatro campos, inclusive ao apagar uma branch
  // ("(delete) 000... refs/heads/x <oid>"). Uma linha com menos campos e
  // entrada corrompida: descarta-la faria o gate concluir que nada esta sendo
  // empurrado e liberar justamente o push que ele existe para barrar.
  it("recusa uma linha incompleta em vez de descartar", () => {
    assert.throws(
      () => parsePrePushInput("refs/heads/feature  refs/heads/feature def456\n"),
      /entrada do pre-push malformada/,
    );
  });

  it("aceita a linha de quatro campos que apaga uma branch", () => {
    assert.deepEqual(parsePrePushInput(`(delete) ${"0".repeat(40)} refs/heads/feature def456\n`), [
      {
        localRef: "(delete)",
        localOid: "0".repeat(40),
        remoteRef: "refs/heads/feature",
        remoteOid: "def456",
      },
    ]);
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

    runCommands([["pnpm", ["test:scripts"]]], fakeSpawn, { PATH: "/usr/bin" }, "linux");

    assert.equal(ambientes[0].TURBO_CONCURRENCY, "50%");
    assert.equal(ambientes[0].PATH, "/usr/bin");
  });

  it("respeita TURBO_CONCURRENCY já definido no ambiente", () => {
    const ambientes = [];
    const fakeSpawn = (_command, _args, options = {}) => {
      ambientes.push(options.env);
      return { status: 0 };
    };

    runCommands([["pnpm", ["test:scripts"]]], fakeSpawn, { TURBO_CONCURRENCY: "2" }, "linux");

    assert.equal(ambientes[0].TURBO_CONCURRENCY, "2");
  });
});

describe("hook executado de ponta a ponta", () => {
  const hookPath = fileURLToPath(new URL("./git-hook-scope.mjs", import.meta.url));
  const repoRoot = path.dirname(path.dirname(hookPath));

  const rodar = (linha, env = {}) =>
    spawnSync(process.execPath, [hookPath, "pre-push"], {
      cwd: repoRoot,
      input: `${linha}\n`,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });

  // Cobre o caminho real: o hook so enxerga o que esta sendo empurrado se conseguir
  // ler a entrada padrao. Uma falha ali deixa o gate cego sem ninguem perceber.
  it("recusa um push que descartaria commit publicado", () => {
    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim();
    const anterior = spawnSync("git", ["rev-parse", "HEAD~1"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim();

    const resultado = rodar(
      `refs/heads/feature/teste ${anterior} refs/heads/feature/teste ${head}`,
    );

    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /reescrita de historico detectada/);
  });

  it("enxerga as refs empurradas em vez de tratar como push sem mudancas", () => {
    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).stdout.trim();

    const resultado = rodar(`refs/heads/feature/teste ${head} refs/heads/feature/teste ${head}`, {
      GIT_HOOK_SCOPE_DRY_RUN: "1",
    });

    assert.doesNotMatch(resultado.stderr, /nao foi possivel ler a entrada do hook/);
  });
});
