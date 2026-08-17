import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  createSnapshot,
  runRecoveryDrill,
  verifySnapshot,
} from "./git-ref-backup.mjs";

function runGit(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      shell: false,
      stdio: ["pipe", "ignore", "ignore"],
    });

    child.once("error", () => reject(new Error("git fixture command failed")));
    child.once("close", (status) => {
      if (status === 0) {
        resolve();
      } else {
        reject(new Error(`git fixture command failed with status ${status}`));
      }
    });
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
