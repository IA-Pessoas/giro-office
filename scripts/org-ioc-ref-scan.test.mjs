import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { main, scanOrganization } from "./org-ioc-ref-scan.mjs";

const IOC = Buffer.from("Rm9yIG9ubHkgdGVzdA==", "base64").toString("utf8");

function runGit(args, input, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks = [];

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.once("error", () => reject(new Error("git fixture command failed")));
    child.once("close", (status) => {
      if (status === 0) resolve(Buffer.concat(chunks));
      else reject(new Error("git fixture command failed"));
    });
    child.stdin.end(input);
  });
}

async function createBareFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fixture-root-"));
  const source = path.join(root, "source.git");
  const empty = path.join(root, "empty.git");
  await runGit(["init", "--bare", source]);
  await runGit(["init", "--bare", empty]);
  const clean = "export default {};";
  await runGit(
    ["-C", source, "fast-import"],
    [
      "blob",
      "mark :1",
      `data ${Buffer.byteLength(clean)}`,
      clean,
      "commit refs/heads/main",
      "author Fixture <fixture@example.invalid> 1700000000 +0000",
      "committer Fixture <fixture@example.invalid> 1700000000 +0000",
      "data 4",
      "main",
      "M 100644 :1 postcss.config.js",
      "",
      "blob",
      "mark :2",
      `data ${Buffer.byteLength(IOC)}`,
      IOC,
      "commit refs/heads/stale",
      "author Fixture <fixture@example.invalid> 1000000000 +0000",
      "committer Fixture <fixture@example.invalid> 1000000000 +0000",
      "data 5",
      "stale",
      "M 100644 :2 postcss.config.js",
      "",
      "reset refs/tags/v1.0.0",
      "from refs/heads/main",
      "",
      "reset refs/pull/1/head",
      "from refs/heads/main",
      "",
      "done",
      "",
    ].join("\n"),
  );
  await runGit(["-C", source, "symbolic-ref", "HEAD", "refs/heads/main"]);
  return { root, source, empty, workspace: path.join(root, "workspace") };
}

function descriptor(name, overrides = {}) {
  return {
    full_name: `IA-Pessoas/${name}`,
    archived: false,
    disabled: false,
    fork: false,
    is_template: false,
    mirror_url: null,
    clone_url: `https://ignored.invalid/${name}.git`,
    private: true,
    ...overrides,
  };
}

function fakeFetch(pages) {
  let index = 0;
  return async () => {
    const page = pages[index++];
    if (!page) throw new Error("unexpected API request");
    return new Response(JSON.stringify(page.body), {
      status: page.status ?? 200,
      headers: page.next ? { link: `<${page.next}>; rel="next"` } : {},
    });
  };
}

function fixtureRunner(fixture, calls = [], { failClone = false } = {}) {
  return async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (failClone && args[0] === "clone") throw new Error("credential and stderr leak");
    const actualArgs = [...args];
    if (actualArgs[0] === "clone") {
      const repository = actualArgs.at(-2).split("/").at(-1).replace(/\.git$/u, "");
      actualArgs[actualArgs.length - 2] = repository === "fixture" ? fixture.source : fixture.empty;
    }
    return { stdout: await runGit(actualArgs, options.input, { cwd: options.cwd }) };
  };
}

test("inventories repository kinds and scans each eligible bare blob once", async () => {
  const fixture = await createBareFixture();
  try {
    const repositories = [
      descriptor("fixture"),
      descriptor("archived", { archived: true }),
      descriptor("disabled", { disabled: true }),
      descriptor("template", { is_template: true }),
      descriptor("mirror", { mirror_url: "https://upstream.invalid/repository.git" }),
      descriptor("fork", { fork: true }),
    ];
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "sensitive-credential",
      workspace: fixture.workspace,
      fetchImpl: fakeFetch([{ body: repositories }]),
      commandRunner: fixtureRunner(fixture),
      now: "2026-08-17T12:00:00.000Z",
    });

    assert.equal(report.inventory.repositoriesDiscovered, 6);
    assert.equal(report.inventory.repositoriesScanned, 6);
    assert.ok(report.repositories.every(({ scanStatus }) => scanStatus === "scanned"));
    assert.equal(report.summary.uniqueBlobsScanned, 2);
    assert.deepEqual(
      report.findings.map(({ repository, ref, ruleId }) => ({ repository, ref, ruleId })),
      [
        {
          repository: "IA-Pessoas/fixture",
          ref: "refs/heads/stale",
          ruleId: "ioc.incident-marker",
        },
      ],
    );
    assert.ok(
      report.repositories
        .find(({ fullName }) => fullName === "IA-Pessoas/fixture")
        .refs.some(
          ({ name, status }) => name === "refs/pull/1/head" && status === "evidence-only",
        ),
    );
    assert.match(report.remediation.items[0].dedupeKey, /^[a-f0-9]{64}$/u);
    assert.doesNotMatch(
      JSON.stringify(report),
      /For only test|sensitive-credential|Authorization|fixture-root/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects pagination outside the GitHub API origin", async () => {
  const fixture = await createBareFixture();
  try {
    await assert.rejects(
      () =>
        scanOrganization({
          organization: "IA-Pessoas",
          token: "secret",
          workspace: fixture.workspace,
          fetchImpl: fakeFetch([
            {
              body: [],
              next: "https://attacker.invalid/orgs/IA-Pessoas/repos?type=all&per_page=100&page=2",
            },
          ]),
          commandRunner: fixtureRunner(fixture),
        }),
      (error) => error.message === "invalid pagination URL",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("bounds empty GitHub pagination and records the coverage limit", async () => {
  const fixture = await createBareFixture();
  let requests = 0;
  try {
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: async () => {
        requests += 1;
        return new Response("[]", {
          headers:
            requests <= 5
              ? {
                  link: `<https://api.github.com/orgs/IA-Pessoas/repos?type=all&per_page=100&page=${requests + 1}>; rel="next"`,
                }
              : {},
        });
      },
      commandRunner: fixtureRunner(fixture),
    });

    assert.equal(requests, 5);
    assert.deepEqual(report.errors, [{ code: "repository_limit_reached" }]);
    assert.equal(report.inventory.coverageLimited, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("retries a throttled inventory request with bounded backoff", async () => {
  const fixture = await createBareFixture();
  let attempts = 0;
  const waits = [];
  try {
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: async () => {
        attempts += 1;
        return attempts === 1
          ? new Response("[]", { status: 429, headers: { "retry-after": "0" } })
          : new Response(JSON.stringify([descriptor("fixture")]));
      },
      commandRunner: fixtureRunner(fixture),
      sleep: async (delay) => waits.push(delay),
    });

    assert.equal(attempts, 2);
    assert.deepEqual(waits, [0]);
    assert.equal(report.inventory.repositoriesScanned, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("turns clone failures into a fixed repository error code", async () => {
  const fixture = await createBareFixture();
  try {
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: fakeFetch([{ body: [descriptor("fixture")] }]),
      commandRunner: fixtureRunner(fixture, [], { failClone: true }),
    });

    assert.deepEqual(report.errors, [
      { repository: "IA-Pessoas/fixture", code: "repository_scan_failed" },
    ]);
    assert.doesNotMatch(JSON.stringify(report), /credential|stderr|secret/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("sanitizes temporary-workspace failures as a repository scan error", async () => {
  const fixture = await createBareFixture();
  const workspaceFile = path.join(fixture.root, "not-a-workspace");
  try {
    await writeFile(workspaceFile, "fixture-only");
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: workspaceFile,
      fetchImpl: fakeFetch([{ body: [descriptor("fixture")] }]),
      commandRunner: fixtureRunner(fixture),
    });

    assert.deepEqual(report.errors, [
      { repository: "IA-Pessoas/fixture", code: "repository_scan_failed" },
    ]);
    assert.doesNotMatch(JSON.stringify(report), /secret|workspace|fixture-root/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("marks oversized blobs as incomplete coverage instead of silently skipping them", async () => {
  const fixture = await createBareFixture();
  try {
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: fakeFetch([{ body: [descriptor("fixture")] }]),
      commandRunner: fixtureRunner(fixture),
      maxBlobBytes: 1,
    });

    assert.ok(report.summary.largeBlobsSkipped > 0);
    assert.deepEqual(report.errors, [
      { repository: "IA-Pessoas/fixture", code: "blob_size_limit_reached" },
    ]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("reports a missing previous ref root as a human-approved history replacement", async () => {
  const fixture = await createBareFixture();
  try {
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: fakeFetch([{ body: [descriptor("fixture")] }]),
      commandRunner: fixtureRunner(fixture),
      previousReport: {
        repositories: [
          {
            fullName: "IA-Pessoas/fixture",
            refs: [{ name: "refs/heads/main", objectId: "a".repeat(40) }],
          },
        ],
      },
    });

    assert.deepEqual(report.refChanges, [
      {
        repository: "IA-Pessoas/fixture",
        ref: "refs/heads/main",
        kind: "root-history-replacement",
        cleanRecoverySha: "a".repeat(40),
        requiresHumanApproval: true,
        backupStatus: "unknown",
        approver: "human-approval-required",
        rollbackPath: "manual-approved-quarantine-recovery",
      },
    ]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("does not alert when the previous ref is an ancestor of the current ref", async () => {
  const fixture = await createBareFixture();
  const runner = fixtureRunner(fixture);
  try {
    const report = await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: fakeFetch([{ body: [descriptor("fixture")] }]),
      commandRunner: async (command, args, options) =>
        args.includes("merge-base") ? { stdout: Buffer.alloc(0) } : runner(command, args, options),
      previousReport: {
        repositories: [
          {
            fullName: "IA-Pessoas/fixture",
            refs: [{ name: "refs/heads/main", objectId: "a".repeat(40) }],
          },
        ],
      },
    });

    assert.deepEqual(report.refChanges, []);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("uses only git with the fixed read-only argument allowlist", async () => {
  const fixture = await createBareFixture();
  const calls = [];
  try {
    await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: fakeFetch([{ body: [descriptor("fixture")] }]),
      commandRunner: fixtureRunner(fixture, calls),
    });

    assert.ok(calls.length > 0);
    assert.ok(calls.every(({ command }) => command === "git"));
    const mirror = calls[0].args.at(-1);
    assert.deepEqual(
      calls.map(({ args }) => args.map((argument) => (argument === mirror ? "<mirror>" : argument))),
      [
        [
          "clone",
          "--mirror",
          "--no-local",
          "--",
          "https://github.com/IA-Pessoas/fixture.git",
          "<mirror>",
        ],
        ["-C", "<mirror>", "fetch", "origin", "+refs/pull/*/head:refs/pull/*/head"],
        ["-C", "<mirror>", "remote", "remove", "origin"],
        [
          "-C",
          "<mirror>",
          "for-each-ref",
          "--format=%(refname)%00%(objectname)%00%(creatordate:unix)",
          "refs/heads",
          "refs/tags",
          "refs/pull",
        ],
        ["-C", "<mirror>", "ls-tree", "-r", "-z", "--full-tree", "refs/heads/main"],
        ["-C", "<mirror>", "ls-tree", "-r", "-z", "--full-tree", "refs/heads/stale"],
        ["-C", "<mirror>", "ls-tree", "-r", "-z", "--full-tree", "refs/pull/1/head"],
        ["-C", "<mirror>", "ls-tree", "-r", "-z", "--full-tree", "refs/tags/v1.0.0"],
        ["-C", "<mirror>", "cat-file", "-s", calls.at(-4).args.at(-1)],
        ["-C", "<mirror>", "cat-file", "blob", calls.at(-3).args.at(-1)],
        ["-C", "<mirror>", "cat-file", "-s", calls.at(-2).args.at(-1)],
        ["-C", "<mirror>", "cat-file", "blob", calls.at(-1).args.at(-1)],
      ],
    );
    assert.ok(calls[0].options.env.GIT_CONFIG_VALUE_0.startsWith("Authorization: Bearer "));
    assert.deepEqual(calls[1].options.env, calls[0].options.env);
    assert.doesNotMatch(JSON.stringify(calls.map(({ args }) => args)), /secret|Authorization/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("caps mirror work at the default concurrency of two", async () => {
  const fixture = await createBareFixture();
  const runner = fixtureRunner(fixture);
  let activeClones = 0;
  let peakClones = 0;
  try {
    await scanOrganization({
      organization: "IA-Pessoas",
      token: "secret",
      workspace: fixture.workspace,
      fetchImpl: fakeFetch([{ body: [descriptor("one"), descriptor("two"), descriptor("three")] }]),
      commandRunner: async (...args) => {
        if (args[1][0] !== "clone") return runner(...args);
        activeClones += 1;
        peakClones = Math.max(peakClones, activeClones);
        try {
          await new Promise((resolve) => setTimeout(resolve, 15));
          return await runner(...args);
        } finally {
          activeClones -= 1;
        }
      },
    });

    assert.equal(peakClones, 2);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("main rejects missing required arguments without exposing environment values", async () => {
  assert.equal(await main([], { GITHUB_ORG_SCANNER_TOKEN: "must-not-leak" }), 2);
});

test("main writes a sanitized report and fails when findings require triage", async () => {
  const originalFetch = globalThis.fetch;
  let written;
  let writtenOutput;
  globalThis.fetch = async () => new Response("[]");
  try {
    const exitCode = await main(
      ["--org", "IA-Pessoas", "--report", "report.json", "--fail-on-findings"],
      { GITHUB_ORG_SCANNER_TOKEN: "must-not-leak" },
      {
        scanOrganization: async () => ({
          errors: [],
          findings: [{ repository: "IA-Pessoas/fixture", ruleId: "ioc.incident-marker" }],
          refChanges: [],
        }),
        writeReport: async (target, content) => {
          written = { target, content };
        },
        writeOutput: (content) => {
          writtenOutput = content;
        },
      },
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(written, {
      target: "report.json",
      content:
        '{"errors":[],"findings":[{"repository":"IA-Pessoas/fixture","ruleId":"ioc.incident-marker"}],"refChanges":[]}\n',
    });
    assert.doesNotMatch(written.content, /must-not-leak/u);
    assert.equal(writtenOutput, written.content);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("main aceita somente o relatório sanitizado anterior para comparar refs", async () => {
  let scanOptions;
  const exitCode = await main(
    ["--org", "IA-Pessoas", "--report", "report.json", "--previous-report", "previous.json"],
    { GITHUB_ORG_SCANNER_TOKEN: "must-not-leak" },
    {
      readPreviousReport: async () =>
        Buffer.from('{"repositories":[{"fullName":"IA-Pessoas/fixture","refs":[]}]}'),
      scanOrganization: async (options) => {
        scanOptions = options;
        return { errors: [], findings: [], refChanges: [] };
      },
      writeReport: async () => {},
      writeOutput: () => {},
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(scanOptions.previousReport, {
    repositories: [{ fullName: "IA-Pessoas/fixture", refs: [] }],
  });
});

test("workflow agendado preserva o escopo somente leitura e publica o relatório", async () => {
  const [workflow, runbook] = await Promise.all([
    readFile(new URL("../.github/workflows/org-ioc-ref-scan.yml", import.meta.url), "utf8"),
    readFile(new URL("../docs/security/org-ioc-ref-scanning.md", import.meta.url), "utf8"),
  ]);

  assert.match(workflow, /permissions:\s*\n\s*contents: read/u);
  assert.match(workflow, /GITHUB_ORG_SCANNER_TOKEN/u);
  assert.match(workflow, /ORG_IOC_REF_PREVIOUS_REPORT/u);
  assert.match(workflow, /--previous-report/u);
  assert.match(workflow, /--fail-on-findings/u);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/u);
  assert.doesNotMatch(workflow, /issues: write|pull-requests: write|contents: write/u);
  assert.match(runbook, /GitHub App/u);
  assert.match(runbook, /somente leitura/u);
  assert.match(runbook, /aprovacao humana/u);
  assert.match(runbook, /sandbox/u);
  assert.match(runbook, /ORG_IOC_REF_PREVIOUS_REPORT/u);
});
