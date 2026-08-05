import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableSortObject(value[key])]),
    );
  }

  return value;
}

export async function writeStableJson(filePath, value) {
  await writeAtomically(filePath, serializeStableJson(value));
}

export async function writeCsv(filePath, columns, rows) {
  await writeAtomically(filePath, serializeCsv(columns, rows));
}

export function serializeStableJson(value) {
  return `${JSON.stringify(stableSortObject(value), null, 2)}\n`;
}

export function serializeCsv(columns, rows) {
  const records = [columns, ...rows.map((row) => columns.map((column) => row[column]))];
  return `${records.map((record) => record.map(escapeCsvValue).join(",")).join("\r\n")}\r\n`;
}

export async function writeFileSetAtomically(
  directoryPath,
  files,
  { replaceDirectories = [] } = {},
) {
  const resolvedDirectory = path.resolve(directoryPath);
  const parentDirectory = path.dirname(resolvedDirectory);
  const baseName = path.basename(resolvedDirectory);
  const operationId = randomUUID();
  const temporaryPath = path.join(parentDirectory, `.${baseName}.${operationId}.tmp`);
  const backupPath = path.join(parentDirectory, `.${baseName}.${operationId}.previous`);
  let previousMoved = false;

  validateRelativeDirectories(replaceDirectories);
  const entries = normalizeFileEntries(files);
  await mkdir(parentDirectory, { recursive: true });

  try {
    if (await pathExists(resolvedDirectory)) {
      const current = await lstat(resolvedDirectory);
      if (!current.isDirectory()) {
        throw new Error("Destino do pacote deve ser um diretório");
      }
      await cp(resolvedDirectory, temporaryPath, { recursive: true, errorOnExist: true });
    } else {
      await mkdir(temporaryPath);
    }

    for (const relativeDirectory of replaceDirectories) {
      await rm(path.join(temporaryPath, relativeDirectory), { force: true, recursive: true });
    }
    for (const [relativePath, content] of entries) {
      const stagedPath = path.join(temporaryPath, relativePath);
      await mkdir(path.dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, content, "utf8");
    }

    if (await pathExists(resolvedDirectory)) {
      await rename(resolvedDirectory, backupPath);
      previousMoved = true;
    }
    try {
      await rename(temporaryPath, resolvedDirectory);
    } catch (error) {
      if (previousMoved) {
        await rename(backupPath, resolvedDirectory);
        previousMoved = false;
      }
      throw error;
    }
    if (previousMoved) {
      await rm(backupPath, { force: true, recursive: true });
      previousMoved = false;
    }
  } catch (error) {
    await rm(temporaryPath, { force: true, recursive: true }).catch(() => {});
    if (previousMoved && !(await pathExists(resolvedDirectory))) {
      await rename(backupPath, resolvedDirectory).catch(() => {});
      previousMoved = false;
    }
    throw error;
  }
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).replace(/\r\n|\r|\n/g, "\r\n");
  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

async function writeAtomically(filePath, content) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function normalizeFileEntries(files) {
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files ?? {});
  return entries
    .map(([relativePath, content]) => {
      validateRelativePath(relativePath);
      if (typeof content !== "string") {
        throw new TypeError("Conteúdo do artefato deve ser texto UTF-8");
      }
      return [relativePath, content];
    })
    .sort(([left], [right]) => compareText(left, right));
}

function validateRelativeDirectories(directories) {
  if (!Array.isArray(directories)) {
    throw new TypeError("replaceDirectories deve ser um array");
  }
  for (const directory of directories) {
    validateRelativePath(directory);
  }
}

function validateRelativePath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Caminho relativo de artefato inválido");
  }
}

async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
