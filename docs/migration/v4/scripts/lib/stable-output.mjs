import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FILE_SYSTEM = Object.freeze({ cp, lstat, mkdir, rename, rm, unlink, writeFile });

export function createNodeFileSystemAdapter() {
  return { ...DEFAULT_FILE_SYSTEM };
}

export function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
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
  { replaceDirectories = [], fileSystem = DEFAULT_FILE_SYSTEM } = {},
) {
  validateFileSystemAdapter(fileSystem);
  const resolvedDirectory = path.resolve(directoryPath);
  const parentDirectory = path.dirname(resolvedDirectory);
  const baseName = path.basename(resolvedDirectory);
  const operationId = randomUUID();
  const temporaryPath = path.join(parentDirectory, `.${baseName}.${operationId}.tmp`);
  const backupPath = path.join(parentDirectory, `.${baseName}.${operationId}.previous`);
  validateOperationPath(temporaryPath, parentDirectory, baseName, operationId, "tmp");
  validateOperationPath(backupPath, parentDirectory, baseName, operationId, "previous");
  validateRelativeDirectories(replaceDirectories);
  const entries = normalizeFileEntries(files);
  let previousMoved = false;
  let installed = false;

  await fileSystem.mkdir(parentDirectory, { recursive: true });
  try {
    if (await pathExists(resolvedDirectory, fileSystem)) {
      const current = await fileSystem.lstat(resolvedDirectory);
      if (!current.isDirectory() || current.isSymbolicLink()) {
        throw createAtomicError("Destino do pacote deve ser diretório real", "validate");
      }
      await fileSystem.cp(resolvedDirectory, temporaryPath, {
        recursive: true,
        errorOnExist: true,
      });
    } else {
      await fileSystem.mkdir(temporaryPath);
    }

    for (const relativeDirectory of replaceDirectories) {
      await fileSystem.rm(path.join(temporaryPath, relativeDirectory), {
        force: true,
        recursive: true,
      });
    }
    for (const [relativePath, content] of entries) {
      const stagedPath = path.join(temporaryPath, relativePath);
      await fileSystem.mkdir(path.dirname(stagedPath), { recursive: true });
      await fileSystem.writeFile(stagedPath, content, "utf8");
    }

    if (await pathExists(resolvedDirectory, fileSystem)) {
      await fileSystem.rename(resolvedDirectory, backupPath);
      previousMoved = true;
    }
    try {
      await fileSystem.rename(temporaryPath, resolvedDirectory);
      installed = true;
    } catch {
      const restored = await restorePrevious({
        backupPath,
        fileSystem,
        previousMoved,
        resolvedDirectory,
      });
      previousMoved = !restored;
      await cleanupExact(temporaryPath, fileSystem).catch(() => {});
      if (!restored && previousMoved) {
        throw createAtomicError("Falha de instalação e restauração requer recuperação", "restore", {
          packageRestored: false,
          recoveryEntry: path.basename(backupPath),
        });
      }
      throw createAtomicError("Falha de instalação; pacote anterior restaurado", "install", {
        packageRestored: true,
      });
    }
  } catch (error) {
    if (!installed) {
      let cleanupFailed = false;
      try {
        await cleanupExact(temporaryPath, fileSystem);
      } catch {
        cleanupFailed = true;
      }
      if (previousMoved && !(await pathExists(resolvedDirectory, fileSystem))) {
        const restored = await restorePrevious({
          backupPath,
          fileSystem,
          previousMoved,
          resolvedDirectory,
        });
        if (!restored) {
          throw createAtomicError("Restauração falhou; recuperação manual necessária", "restore", {
            packageRestored: false,
            recoveryEntry: path.basename(backupPath),
            tempCleanupPending: cleanupFailed,
          });
        }
        previousMoved = false;
      }
      if (error?.atomicSafe === true) throw error;
      throw createAtomicError(
        "Falha antes do commit atômico; pacote anterior preservado",
        "stage",
        {
          packageRestored: true,
          tempCleanupPending: cleanupFailed,
        },
      );
    }
    throw error;
  }

  if (!previousMoved) return { committed: true, cleanupPending: false, recoveryEntry: null };
  try {
    await cleanupExact(backupPath, fileSystem);
    return { committed: true, cleanupPending: false, recoveryEntry: null };
  } catch {
    return {
      committed: true,
      cleanupPending: true,
      recoveryEntry: path.basename(backupPath),
    };
  }
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\r\n|\r|\n/g, "\r\n");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (!/[",\r\n]/.test(text)) return text;
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

async function restorePrevious({ backupPath, fileSystem, previousMoved, resolvedDirectory }) {
  if (!previousMoved) return true;
  try {
    await fileSystem.rename(backupPath, resolvedDirectory);
    return true;
  } catch {
    try {
      await fileSystem.cp(backupPath, resolvedDirectory, { recursive: true, errorOnExist: true });
      return true;
    } catch {
      return false;
    }
  }
}

async function cleanupExact(target, fileSystem) {
  await fileSystem.rm(target, { force: true, recursive: true });
}

function createAtomicError(message, phase, recovery = {}) {
  const error = new Error(message);
  error.atomicSafe = true;
  error.recovery = Object.freeze({ phase, ...recovery });
  return error;
}

function validateFileSystemAdapter(fileSystem) {
  for (const method of ["cp", "lstat", "mkdir", "rename", "rm", "writeFile"]) {
    if (typeof fileSystem?.[method] !== "function") {
      throw new TypeError("Adapter de filesystem incompleto");
    }
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
  if (!Array.isArray(directories)) throw new TypeError("replaceDirectories deve ser array");
  for (const directory of directories) validateRelativePath(directory);
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

function validateOperationPath(target, parentDirectory, baseName, operationId, suffix) {
  const expected = path.join(parentDirectory, `.${baseName}.${operationId}.${suffix}`);
  if (target !== expected || path.dirname(target) !== parentDirectory) {
    throw new Error("Caminho temporário atômico inválido");
  }
}

async function pathExists(filePath, fileSystem) {
  try {
    await fileSystem.lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
