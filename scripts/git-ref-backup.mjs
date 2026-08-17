import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUNDLE_FILE = "repository.bundle";
const MANIFEST_FILE = "manifest.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const OBJECT_ID_PATTERN = /^[a-f0-9]{40,64}$/u;
const REF_NAME_PATTERN = /^refs\/[A-Za-z0-9._/-]+$/u;

function commandFailure(command, status) {
  return new Error(`${command} failed with status ${status ?? "unknown"}`);
}

async function run(command, args, { cwd, commandRunner } = {}) {
  if (commandRunner) {
    const result = await commandRunner(command, args, { cwd });
    if (!result || typeof result.stdout !== "string") {
      throw new Error(`${command} returned an invalid result`);
    }
    return result.stdout;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks = [];

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.once("error", () => reject(commandFailure(command)));
    child.once("close", (status) => {
      if (status === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } else {
        reject(commandFailure(command, status));
      }
    });
  });
}

async function requireNewDirectory(directory, label) {
  try {
    await lstat(directory);
  } catch {
    await mkdir(directory, { recursive: true });
    return;
  }
  throw new Error(`${label} must be new`);
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function parseRefs(output) {
  const refs = [];
  for (const line of output.split(/\r?\n/u)) {
    if (!line) continue;
    const [name, objectId] = line.split(" ");
    if (!REF_NAME_PATTERN.test(name) || !OBJECT_ID_PATTERN.test(objectId)) {
      throw new Error("git returned invalid refs");
    }
    refs.push({ name, objectId });
  }
  return refs;
}

function validateManifest(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    typeof value.repositoryId !== "string" ||
    !value.repositoryId ||
    typeof value.createdAt !== "string" ||
    !value.bundle ||
    value.bundle.file !== BUNDLE_FILE ||
    !SHA256_PATTERN.test(value.bundle.sha256) ||
    !Array.isArray(value.refs) ||
    !value.refs.every(
      (ref) => REF_NAME_PATTERN.test(ref?.name) && OBJECT_ID_PATTERN.test(ref?.objectId),
    ) ||
    value.verification?.gitFsck !== "passed" ||
    value.verification?.bundleVerify !== "passed" ||
    value.immutability?.status !== "external-control-required"
  ) {
    throw new Error("snapshot manifest is invalid");
  }
  return value;
}

async function readManifest(snapshotDirectory) {
  try {
    return validateManifest(JSON.parse(await readFile(path.join(snapshotDirectory, MANIFEST_FILE), "utf8")));
  } catch (error) {
    if (error.message === "snapshot manifest is invalid") throw error;
    throw new Error("snapshot manifest is invalid");
  }
}

function snapshotName(createdAt) {
  return `snapshot-${createdAt.replace(/[:.]/gu, "-")}`;
}

export async function createSnapshot({ source, destination, repositoryId, commandRunner } = {}) {
  if (typeof source !== "string" || !source || typeof repositoryId !== "string" || !repositoryId) {
    throw new Error("source and repositoryId are required");
  }
  if (typeof destination !== "string" || !destination) {
    throw new Error("snapshot destination is required");
  }

  await requireNewDirectory(destination, "snapshot destination");
  const createdAt = new Date().toISOString();
  const snapshotDirectory = path.join(destination, snapshotName(createdAt));
  const mirrorDirectory = path.join(snapshotDirectory, "mirror.git");
  const bundlePath = path.join(snapshotDirectory, BUNDLE_FILE);
  const manifestPath = path.join(snapshotDirectory, MANIFEST_FILE);
  await mkdir(snapshotDirectory);

  await run("git", ["clone", "--mirror", "--no-local", source, mirrorDirectory], { commandRunner });
  await run("git", ["-C", mirrorDirectory, "remote", "remove", "origin"], { commandRunner });
  await run("git", ["-C", mirrorDirectory, "fsck", "--full", "--strict"], { commandRunner });
  const refs = parseRefs(
    await run("git", ["-C", mirrorDirectory, "for-each-ref", "--format=%(refname) %(objectname)"], {
      commandRunner,
    }),
  );
  await run("git", ["-C", mirrorDirectory, "bundle", "create", bundlePath, "--all"], {
    commandRunner,
  });
  await run("git", ["-C", mirrorDirectory, "bundle", "verify", bundlePath], { commandRunner });

  const manifest = {
    schemaVersion: 1,
    repositoryId,
    createdAt,
    bundle: { file: BUNDLE_FILE, sha256: await sha256(bundlePath) },
    refs,
    verification: { gitFsck: "passed", bundleVerify: "passed" },
    immutability: { status: "external-control-required" },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { snapshotDirectory, manifestPath, bundlePath, manifest };
}

export async function verifySnapshot({ snapshotDirectory, commandRunner } = {}) {
  if (typeof snapshotDirectory !== "string" || !snapshotDirectory) {
    throw new Error("snapshot directory is required");
  }

  const manifest = await readManifest(snapshotDirectory);
  const mirrorDirectory = path.join(snapshotDirectory, "mirror.git");
  const bundlePath = path.join(snapshotDirectory, BUNDLE_FILE);
  await access(mirrorDirectory);
  if ((await sha256(bundlePath)) !== manifest.bundle.sha256) {
    throw new Error("snapshot bundle checksum does not match");
  }
  await run("git", ["-C", mirrorDirectory, "fsck", "--full", "--strict"], { commandRunner });
  await run("git", ["-C", mirrorDirectory, "bundle", "verify", bundlePath], { commandRunner });

  return { ok: true, manifest };
}

export async function runRecoveryDrill({ snapshotDirectory, quarantineDirectory, commandRunner } = {}) {
  if (typeof quarantineDirectory !== "string" || !quarantineDirectory) {
    throw new Error("quarantine directory is required");
  }
  await requireNewDirectory(quarantineDirectory, "quarantine directory");

  const { manifest } = await verifySnapshot({ snapshotDirectory, commandRunner });
  const bundlePath = path.join(snapshotDirectory, manifest.bundle.file);
  await run("git", ["clone", "--bare", bundlePath, quarantineDirectory], { commandRunner });
  await run("git", ["-C", quarantineDirectory, "fsck", "--full", "--strict"], { commandRunner });
  const restoredRefs = parseRefs(
    await run(
      "git",
      ["-C", quarantineDirectory, "for-each-ref", "--format=%(refname) %(objectname)"],
      { commandRunner },
    ),
  ).length;

  return { ok: true, restoredRefs };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function main(args = process.argv.slice(2)) {
  const [command] = args;
  if (command === "snapshot") {
    await createSnapshot({
      source: option(args, "--source"),
      destination: option(args, "--destination"),
      repositoryId: option(args, "--repository-id"),
    });
    return 0;
  }
  if (command === "verify") {
    await verifySnapshot({ snapshotDirectory: option(args, "--snapshot-directory") });
    return 0;
  }
  if (command === "drill") {
    await runRecoveryDrill({
      snapshotDirectory: option(args, "--snapshot-directory"),
      quarantineDirectory: option(args, "--quarantine-directory"),
    });
    return 0;
  }
  throw new Error("expected snapshot, verify, or drill command");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
