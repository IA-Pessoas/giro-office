import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUNDLE_FILE = "repository.bundle";
const MANIFEST_FILE = "manifest.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const OBJECT_ID_PATTERN = /^[a-f0-9]{40,64}$/u;
const REF_NAME_PATTERN = /^refs\/[A-Za-z0-9._/-]+$/u;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const REPOSITORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const METADATA_PAGE_SIZE = 100;
const METADATA_MAX_ITEMS = 1_000;
const METADATA_MAX_PAGES = METADATA_MAX_ITEMS / METADATA_PAGE_SIZE;
const METADATA_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEPLOYMENT_STATUS_CONCURRENCY = 4;

function commandFailure(command, status) {
  return new Error(`${command} failed with status ${status ?? "unknown"}`);
}

async function run(command, args, { cwd, commandRunner, maxOutputBytes } = {}) {
  if (commandRunner) {
    let result;
    try {
      result = await commandRunner(command, args, { cwd });
    } catch {
      throw commandFailure(command);
    }
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
    let outputBytes = 0;
    let outputTooLarge = false;

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (maxOutputBytes && outputBytes > maxOutputBytes) {
        outputTooLarge = true;
        child.kill();
      } else {
        chunks.push(chunk);
      }
    });
    child.once("error", () => reject(commandFailure(command)));
    child.once("close", (status) => {
      if (outputTooLarge) {
        reject(new Error(`${command} output exceeded limit`));
      } else if (status === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } else {
        reject(commandFailure(command, status));
      }
    });
  });
}

async function createNewDirectory(directory, label) {
  try {
    await mkdir(directory);
  } catch {
    throw new Error(`${label} must be new`);
  }
}

async function sha256(file) {
  try {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk);
    }
    return hash.digest("hex");
  } catch {
    throw new Error("snapshot bundle cannot be read");
  }
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

function parseBundleRefs(output) {
  const refs = [];
  for (const line of output.split(/\r?\n/u)) {
    if (!line) continue;
    const [objectId, name] = line.split(" ");
    if (!REF_NAME_PATTERN.test(name) || !OBJECT_ID_PATTERN.test(objectId)) {
      throw new Error("git returned invalid refs");
    }
    refs.push({ name, objectId });
  }
  return refs;
}

function refsMatch(left, right) {
  if (left.length !== right.length) return false;
  const sort = (first, second) =>
    `${first.name}\0${first.objectId}`.localeCompare(`${second.name}\0${second.objectId}`);
  const expected = [...left].sort(sort);
  const actual = [...right].sort(sort);
  return expected.every(
    (ref, index) => ref.name === actual[index].name && ref.objectId === actual[index].objectId,
  );
}

function validateManifest(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    typeof value.repositoryId !== "string" ||
    !REPOSITORY_ID_PATTERN.test(value.repositoryId) ||
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

function normalizeSource(source) {
  if (typeof source !== "string" || !source) {
    throw new Error("source must be an absolute local path or safe HTTPS URL");
  }
  if (path.isAbsolute(source)) return path.resolve(source);
  try {
    const url = new URL(source);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname === "/"
    ) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error("source must be an absolute local path or safe HTTPS URL");
  }
}

function appendQuery(route, query) {
  return `${route}?${new URLSearchParams(query).toString()}`;
}

function metadataError() {
  return new Error("GitHub metadata response is invalid");
}

function parseMetadataArray(output) {
  try {
    const value = JSON.parse(output);
    if (!Array.isArray(value) || value.length > METADATA_PAGE_SIZE) throw metadataError();
    return value;
  } catch {
    throw metadataError();
  }
}

function stringField(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 500 ? value : undefined;
}

function positiveId(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function githubUrl(value, repository, resource, number) {
  const expected = `https://github.com/${repository}/${resource}/${number}`;
  return value === expected ? value : undefined;
}

async function readMetadataCollection(repository, route, project, commandRunner, query = {}) {
  const items = [];
  for (let page = 1; page <= METADATA_MAX_PAGES; page += 1) {
    const output = await run(
      "gh",
      [
        "api",
        "--method",
        "GET",
        appendQuery(`repos/${repository}/${route}`, {
          ...query,
          per_page: METADATA_PAGE_SIZE,
          page,
        }),
      ],
      { commandRunner, maxOutputBytes: METADATA_MAX_OUTPUT_BYTES },
    );
    const response = parseMetadataArray(output);
    for (const value of response) {
      const projected = project(value);
      if (projected === undefined) throw metadataError();
      if (projected !== null) items.push(projected);
    }
    if (response.length < METADATA_PAGE_SIZE) break;
  }
  return items;
}

async function mapBounded(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function captureMetadata(repository, commandRunner) {
  const rulesets = await readMetadataCollection(repository, "rulesets", (value) => {
    const id = positiveId(value?.id);
    const name = stringField(value?.name);
    return id && name ? { id, name } : undefined;
  }, commandRunner);
  const releases = await readMetadataCollection(repository, "releases", (value) => {
    const id = positiveId(value?.id);
    const tag = stringField(value?.tag_name);
    return id && tag ? { id, tag } : undefined;
  }, commandRunner);
  const issues = await readMetadataCollection(
    repository,
    "issues",
    (value) => {
      if (value?.pull_request) return null;
      const number = positiveId(value?.number);
      const state = stringField(value?.state);
      const url = githubUrl(value?.html_url, repository, "issues", number);
      return number && state && url ? { number, state, url } : undefined;
    },
    commandRunner,
    { state: "all" },
  );
  const pullRequests = await readMetadataCollection(
    repository,
    "pulls",
    (value) => {
      const number = positiveId(value?.number);
      const state = stringField(value?.state);
      const url = githubUrl(value?.html_url, repository, "pull", number);
      return number && state && url ? { number, state, url } : undefined;
    },
    commandRunner,
    { state: "all" },
  );
  const deployments = await readMetadataCollection(repository, "deployments", (value) => {
    const id = positiveId(value?.id);
    const environment = stringField(value?.environment);
    return id && environment ? { id, environment } : undefined;
  }, commandRunner);
  const deploymentMetadata = await mapBounded(
    deployments,
    DEPLOYMENT_STATUS_CONCURRENCY,
    async (deployment) => {
      const output = await run(
        "gh",
        [
          "api",
          "--method",
          "GET",
          appendQuery(`repos/${repository}/deployments/${deployment.id}/statuses`, { per_page: 1 }),
        ],
        { commandRunner, maxOutputBytes: METADATA_MAX_OUTPUT_BYTES },
      );
      const [status] = parseMetadataArray(output);
      const state = stringField(status?.state);
      if (!state) throw metadataError();
      return { ...deployment, state };
    },
  );

  return { rulesets, releases, issues, pullRequests, deployments: deploymentMetadata };
}

export async function createSnapshot({
  source,
  destination,
  repositoryId,
  githubRepository,
  includeMetadata = false,
  commandRunner,
} = {}) {
  const normalizedSource = normalizeSource(source);
  if (!REPOSITORY_ID_PATTERN.test(repositoryId ?? "")) throw new Error("repositoryId is invalid");
  if (typeof destination !== "string" || !destination) {
    throw new Error("snapshot destination is required");
  }
  if (includeMetadata && !GITHUB_REPOSITORY_PATTERN.test(githubRepository ?? "")) {
    throw new Error("a valid GitHub repository is required for metadata");
  }

  const normalizedDestination = path.resolve(destination);
  await createNewDirectory(normalizedDestination, "snapshot destination");
  const createdAt = new Date().toISOString();
  const snapshotDirectory = path.join(normalizedDestination, snapshotName(createdAt));
  const mirrorDirectory = path.join(snapshotDirectory, "mirror.git");
  const bundlePath = path.join(snapshotDirectory, BUNDLE_FILE);
  const manifestPath = path.join(snapshotDirectory, MANIFEST_FILE);
  await mkdir(snapshotDirectory);

  await run("git", ["clone", "--mirror", "--no-local", normalizedSource, mirrorDirectory], {
    commandRunner,
  });
  await run("git", ["-C", mirrorDirectory, "remote", "remove", "--", "origin"], {
    commandRunner,
  });
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
  if (includeMetadata) {
    const metadata = await captureMetadata(githubRepository, commandRunner);
    await writeFile(
      path.join(snapshotDirectory, "github-metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
  }
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
  try {
    await access(mirrorDirectory);
  } catch {
    throw new Error("snapshot mirror cannot be read");
  }
  if ((await sha256(bundlePath)) !== manifest.bundle.sha256) {
    throw new Error("snapshot bundle checksum does not match");
  }
  await run("git", ["-C", mirrorDirectory, "fsck", "--full", "--strict"], { commandRunner });
  await run("git", ["-C", mirrorDirectory, "bundle", "verify", bundlePath], { commandRunner });
  const mirrorRefs = parseRefs(
    await run("git", ["-C", mirrorDirectory, "for-each-ref", "--format=%(refname) %(objectname)"], {
      commandRunner,
    }),
  );
  const bundleRefs = parseBundleRefs(
    await run("git", ["-C", mirrorDirectory, "bundle", "list-heads", bundlePath], {
      commandRunner,
    }),
  );
  if (!refsMatch(manifest.refs, mirrorRefs) || !refsMatch(manifest.refs, bundleRefs)) {
    throw new Error("snapshot refs do not match");
  }

  return { ok: true, manifest };
}

export async function runRecoveryDrill({ snapshotDirectory, quarantineDirectory, commandRunner } = {}) {
  if (typeof quarantineDirectory !== "string" || !quarantineDirectory) {
    throw new Error("quarantine directory is required");
  }
  const normalizedQuarantineDirectory = path.resolve(quarantineDirectory);
  await createNewDirectory(normalizedQuarantineDirectory, "quarantine directory");

  const { manifest } = await verifySnapshot({ snapshotDirectory, commandRunner });
  const bundlePath = path.join(snapshotDirectory, manifest.bundle.file);
  await run("git", ["clone", "--bare", bundlePath, normalizedQuarantineDirectory], {
    commandRunner,
  });
  await run("git", ["-C", normalizedQuarantineDirectory, "remote", "remove", "--", "origin"], {
    commandRunner,
  });
  await run("git", ["-C", normalizedQuarantineDirectory, "fsck", "--full", "--strict"], {
    commandRunner,
  });
  const restoredRefs = parseRefs(
    await run(
      "git",
      ["-C", normalizedQuarantineDirectory, "for-each-ref", "--format=%(refname) %(objectname)"],
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
      githubRepository: option(args, "--github-repo"),
      includeMetadata: args.includes("--include-metadata"),
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
  main().catch(() => {
    process.stderr.write("git ref backup operation failed\n");
    process.exitCode = 1;
  });
}
