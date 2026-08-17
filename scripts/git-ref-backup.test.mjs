import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createSnapshot,
  runRecoveryDrill,
  verifySnapshot,
} from "./git-ref-backup.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runGit(args, input, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks = [];

    child.once("error", () => reject(new Error("git fixture command failed")));
    child.once("close", (status) => {
      if (status === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } else {
        reject(new Error(`git fixture command failed with status ${status}`));
      }
    });
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stdin.end(input);
  });
}

async function createBareFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "giro-git-backup-"));
  const source = path.join(root, "source.git");
  await runGit(["init", "--bare", source]);
  await runGit(
    ["-C", source, "fast-import"],
    [
      "blob",
      "mark :1",
      "data 5",
      "seed",
      "commit refs/heads/main",
      "author Fixture <fixture@example.invalid> 0 +0000",
      "committer Fixture <fixture@example.invalid> 0 +0000",
      "data 5",
      "seed",
      "M 100644 :1 README.md",
      "",
      "done",
      "",
    ].join("\n"),
  );
  return { root, source };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function createFixtureRunner(responseForRoute, seenRoutes = []) {
  return async (command, args, { cwd } = {}) => {
    if (command === "git") {
      return { stdout: await runGit(args, undefined, { cwd }) };
    }
    if (command !== "gh") {
      throw new Error("unexpected fixture command");
    }

    const route = args.at(-1);
    seenRoutes.push(route);
    return { stdout: JSON.stringify(responseForRoute(route)) };
  };
}

function runProgram(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    const chunks = [];

    child.once("error", () => reject(new Error("program fixture command failed")));
    child.once("close", (status) => resolve({ status, stderr: Buffer.concat(chunks).toString("utf8") }));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
  });
}

test("creates a mirror-only bundle and a checksum manifest", async () => {
  const fixture = await createBareFixture();
  try {
    const result = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "IA-Pessoas/giro-office",
    });

    assert.match(result.manifest.bundle.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(result.manifest.refs.some(({ name }) => name === "refs/heads/main"));
    assert.doesNotMatch(JSON.stringify(result.manifest), new RegExp(escapeRegex(fixture.root), "u"));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("refuses a snapshot destination that already exists", async () => {
  const fixture = await createBareFixture();
  try {
    const destination = path.join(fixture.root, "existing");
    await runGit(["init", "--bare", destination]);

    await assert.rejects(() =>
      createSnapshot({
        source: fixture.source,
        destination,
        repositoryId: "owner/repo",
      }),
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects option-like sources before creating a snapshot destination", async () => {
  const fixture = await createBareFixture();
  const destination = path.join(fixture.root, "snapshots");
  try {
    await assert.rejects(
      () =>
        createSnapshot({
          source: "--upload-pack=untrusted",
          destination,
          repositoryId: "owner/repo",
          commandRunner: async () => {
            throw new Error("git must not run");
          },
        }),
      (error) => error.message === "source must be an absolute local path or safe HTTPS URL",
    );
    await assert.rejects(() => lstat(destination));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects repository identifiers that could persist a path, URL, or secret", async () => {
  const fixture = await createBareFixture();
  const destination = path.join(fixture.root, "snapshots");
  try {
    await assert.rejects(
      () =>
        createSnapshot({
          source: fixture.source,
          destination,
          repositoryId: "https://token@example.invalid/owner/repo",
        }),
      (error) => error.message === "repositoryId is invalid",
    );
    await assert.rejects(() => lstat(destination));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("atomically reserves a new snapshot destination", async () => {
  const fixture = await createBareFixture();
  try {
    const destination = path.join(fixture.root, "snapshots");
    const attempts = await Promise.allSettled([
      createSnapshot({ source: fixture.source, destination, repositoryId: "owner/repo" }),
      createSnapshot({ source: fixture.source, destination, repositoryId: "owner/repo" }),
    ]);

    assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
    const rejected = attempts.find(({ status }) => status === "rejected");
    assert.equal(rejected.reason.message, "snapshot destination must be new");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("verifies a snapshot and restores it only to a new quarantine mirror", async () => {
  const fixture = await createBareFixture();
  try {
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
    });
    const quarantineDirectory = path.join(fixture.root, "quarantine.git");

    await assert.doesNotReject(() => verifySnapshot({ snapshotDirectory: snapshot.snapshotDirectory }));
    const drill = await runRecoveryDrill({
      snapshotDirectory: snapshot.snapshotDirectory,
      quarantineDirectory,
    });

    assert.deepEqual(drill, { ok: true, restoredRefs: 1 });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("atomically reserves quarantine before verifying the snapshot", async () => {
  const fixture = await createBareFixture();
  try {
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
    });
    const quarantineDirectory = path.join(fixture.root, "quarantine.git");
    let lateCreationAttempted = false;
    const commandRunner = async (command, args, { cwd } = {}) => {
      if (command === "git" && !lateCreationAttempted && args.includes("fsck")) {
        lateCreationAttempted = true;
        await mkdir(quarantineDirectory);
      }
      return { stdout: await runGit(args, undefined, { cwd }) };
    };

    await assert.rejects(
      () =>
        runRecoveryDrill({
          snapshotDirectory: snapshot.snapshotDirectory,
          quarantineDirectory,
          commandRunner,
        }),
      (error) => error.message === "git failed with status unknown",
    );
    assert.equal(lateCreationAttempted, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a snapshot when mirror refs differ from the manifest", async () => {
  const fixture = await createBareFixture();
  try {
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
    });
    await runGit(
      ["-C", path.join(snapshot.snapshotDirectory, "mirror.git"), "fast-import"],
      [
        "blob",
        "mark :1",
        "data 5",
        "extra",
        "commit refs/heads/extra",
        "author Fixture <fixture@example.invalid> 0 +0000",
        "committer Fixture <fixture@example.invalid> 0 +0000",
        "data 5",
        "extra",
        "M 100644 :1 EXTRA.md",
        "",
        "done",
        "",
      ].join("\n"),
    );

    await assert.rejects(
      () => verifySnapshot({ snapshotDirectory: snapshot.snapshotDirectory }),
      (error) => error.message === "snapshot refs do not match",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a snapshot when manifest refs differ from the verified bundle", async () => {
  const fixture = await createBareFixture();
  try {
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
    });
    const manifest = JSON.parse(await readFile(snapshot.manifestPath, "utf8"));
    manifest.refs[0].objectId = "a".repeat(40);
    await writeFile(snapshot.manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

    await assert.rejects(
      () => verifySnapshot({ snapshotDirectory: snapshot.snapshotDirectory }),
      (error) => error.message === "snapshot refs do not match",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a manifest whose repositoryId violates the snapshot allowlist", async () => {
  const fixture = await createBareFixture();
  try {
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
    });
    const manifest = JSON.parse(await readFile(snapshot.manifestPath, "utf8"));
    manifest.repositoryId = "https://token@example.invalid/owner/repo";
    await writeFile(snapshot.manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

    await assert.rejects(
      () => verifySnapshot({ snapshotDirectory: snapshot.snapshotDirectory }),
      (error) => error.message === "snapshot manifest is invalid",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("CLI sanitizes filesystem failures", async () => {
  const fixture = await createBareFixture();
  try {
    const result = await runProgram([
      path.join(repositoryRoot, "scripts", "git-ref-backup.mjs"),
      "snapshot",
      "--source",
      fixture.source,
      "--destination",
      path.join(fixture.root, "missing-parent", "snapshots"),
      "--repository-id",
      "owner/repo",
    ]);

    assert.equal(result.status, 1);
    assert.equal(result.stderr, "git ref backup operation failed\n");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("does not retain source locations in snapshot or quarantine mirror configuration", async () => {
  const fixture = await createBareFixture();
  try {
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
    });
    const quarantineDirectory = path.join(fixture.root, "quarantine.git");
    await runRecoveryDrill({ snapshotDirectory: snapshot.snapshotDirectory, quarantineDirectory });

    await assert.rejects(() =>
      runGit(["-C", path.join(snapshot.snapshotDirectory, "mirror.git"), "config", "--get", "remote.origin.url"]),
    );
    await assert.rejects(() => runGit(["-C", quarantineDirectory, "config", "--get", "remote.origin.url"]));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("sanitizes unreadable snapshot errors", async () => {
  const fixture = await createBareFixture();
  try {
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
    });
    await rm(snapshot.bundlePath, { force: true });

    await assert.rejects(
      () => verifySnapshot({ snapshotDirectory: snapshot.snapshotDirectory }),
      (error) => error.message === "snapshot bundle cannot be read",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("sanitizes command runner failures", async () => {
  const fixture = await createBareFixture();
  try {
    await assert.rejects(
      () =>
        createSnapshot({
          source: fixture.source,
          destination: path.join(fixture.root, "snapshots"),
          repositoryId: "owner/repo",
          commandRunner: async () => {
            throw new Error("source token must not be exposed");
          },
        }),
      (error) => error.message === "git failed with status unknown",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("stores only allowlisted GitHub metadata fields", async () => {
  const fixture = await createBareFixture();
  try {
    const commandRunner = createFixtureRunner((route) => {
      if (route.endsWith("/rulesets?per_page=100&page=1")) {
        return [{ id: 4, name: "Protect main", bypass_actors: [{ actor_id: 9 }] }];
      }
      if (route.endsWith("/releases?per_page=100&page=1")) {
        return [{ id: 3, tag_name: "v1.0.0", body: "secret" }];
      }
      if (route.endsWith("/issues?state=all&per_page=100&page=1")) {
        return [
          {
            number: 1,
            state: "open",
            html_url: "https://github.com/owner/repo/issues/1",
            body: "secret token webhook",
          },
        ];
      }
      if (route.endsWith("/pulls?state=all&per_page=100&page=1")) return [];
      if (route.endsWith("/deployments?per_page=100&page=1")) {
        return [{ id: 8, environment: "production", statuses_url: "not-allowlisted" }];
      }
      if (route.endsWith("/deployments/8/statuses?per_page=1")) {
        return [{ state: "success", description: "secret" }];
      }
      throw new Error("unexpected GitHub route");
    });
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
      githubRepository: "owner/repo",
      includeMetadata: true,
      commandRunner,
    });
    const metadata = JSON.parse(
      await readFile(path.join(snapshot.snapshotDirectory, "github-metadata.json"), "utf8"),
    );

    assert.deepEqual(metadata, {
      rulesets: [{ id: 4, name: "Protect main" }],
      releases: [{ id: 3, tag: "v1.0.0" }],
      issues: [{ number: 1, state: "open", url: "https://github.com/owner/repo/issues/1" }],
      pullRequests: [],
      deployments: [{ id: 8, environment: "production", state: "success" }],
    });
    assert.doesNotMatch(JSON.stringify(metadata), /body|secret|token|webhook/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("limits GitHub metadata pagination before writing the metadata file", async () => {
  const fixture = await createBareFixture();
  const seenRoutes = [];
  try {
    const commandRunner = createFixtureRunner((route) => {
      if (route.includes("/issues?")) {
        const page = Number(new URLSearchParams(route.split("?")[1]).get("page"));
        return Array.from({ length: 100 }, (_, index) => ({
          number: page * 100 + index + 1,
          state: "open",
          html_url: `https://github.com/owner/repo/issues/${page * 100 + index + 1}`,
        }));
      }
      if (route.includes("/rulesets?") || route.includes("/releases?") || route.includes("/pulls?")) {
        return [];
      }
      if (route.includes("/deployments?")) return [];
      throw new Error("unexpected GitHub route");
    }, seenRoutes);
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
      githubRepository: "owner/repo",
      includeMetadata: true,
      commandRunner,
    });
    const metadata = JSON.parse(
      await readFile(path.join(snapshot.snapshotDirectory, "github-metadata.json"), "utf8"),
    );

    assert.equal(metadata.issues.length, 1_000);
    assert.ok(!seenRoutes.some((route) => route.includes("/issues?") && route.endsWith("page=11")));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("keeps pull requests out of the issues metadata collection", async () => {
  const fixture = await createBareFixture();
  try {
    const commandRunner = createFixtureRunner((route) => {
      if (route.includes("/rulesets?") || route.includes("/releases?") || route.includes("/deployments?")) {
        return [];
      }
      if (route.includes("/issues?")) {
        return [
          { number: 1, state: "open", html_url: "https://github.com/owner/repo/issues/1" },
          {
            number: 2,
            state: "open",
            html_url: "https://github.com/owner/repo/pull/2",
            pull_request: { url: "not-allowlisted" },
          },
        ];
      }
      if (route.includes("/pulls?")) {
        return [{ number: 2, state: "open", html_url: "https://github.com/owner/repo/pull/2" }];
      }
      throw new Error("unexpected GitHub route");
    });
    const snapshot = await createSnapshot({
      source: fixture.source,
      destination: path.join(fixture.root, "snapshots"),
      repositoryId: "owner/repo",
      githubRepository: "owner/repo",
      includeMetadata: true,
      commandRunner,
    });
    const metadata = JSON.parse(
      await readFile(path.join(snapshot.snapshotDirectory, "github-metadata.json"), "utf8"),
    );

    assert.deepEqual(metadata.issues, [
      { number: 1, state: "open", url: "https://github.com/owner/repo/issues/1" },
    ]);
    assert.deepEqual(metadata.pullRequests, [
      { number: 2, state: "open", url: "https://github.com/owner/repo/pull/2" },
    ]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("documents external immutable storage and quarantine-only recovery prerequisites", async () => {
  const guide = await readFile(path.join(repositoryRoot, "docs/security/git-ref-backups.md"), "utf8");

  assert.match(guide, /object lock|write-once/iu);
  assert.match(guide, /quarentena/iu);
  assert.match(guide, /quatro horas|4 horas/iu);
  assert.match(guide, /aprovação explícita/iu);
});
