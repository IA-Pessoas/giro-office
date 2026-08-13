import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FILE_SYSTEM = Object.freeze({
  cp,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
});

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
  { replaceDirectories = [], replaceFiles = [], fileSystem = DEFAULT_FILE_SYSTEM } = {},
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
  validateRelativeFiles(replaceFiles);
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
      await assertNoSymlinkTree(resolvedDirectory, fileSystem);
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
    for (const relativeFile of replaceFiles) {
      await fileSystem.rm(path.join(temporaryPath, relativeFile), {
        force: true,
        recursive: false,
      });
    }
    for (const [relativePath, content] of entries) {
      const stagedPath = path.join(temporaryPath, relativePath);
      await fileSystem.mkdir(path.dirname(stagedPath), { recursive: true });
      await fileSystem.writeFile(stagedPath, content, "utf8");
    }
    await assertNoSymlinkTree(temporaryPath, fileSystem);

    if (await pathExists(resolvedDirectory, fileSystem)) {
      await fileSystem.rename(resolvedDirectory, backupPath);
      previousMoved = true;
    }
    try {
      await fileSystem.rename(temporaryPath, resolvedDirectory);
      installed = true;
    } catch {
      const restoration = await restorePrevious({
        backupPath,
        fileSystem,
        previousMoved,
        resolvedDirectory,
      });
      previousMoved =
        restoration.restored && restoration.method === "rename" ? false : previousMoved;
      await cleanupExact(temporaryPath, fileSystem).catch(() => {});
      if (!restoration.restored && previousMoved) {
        throw createAtomicError("Falha de instalação e restauração requer recuperação", "restore", {
          packageRestored: false,
          recoveryEntry: path.basename(backupPath),
          recoveryPath: path.basename(backupPath),
        });
      }
      throw createAtomicError("Falha de instalação; pacote anterior restaurado", "install", {
        packageRestored: true,
        restorationMethod: restoration.method,
        ...(restoration.method === "copy"
          ? {
              recoveryEntry: path.basename(backupPath),
              recoveryPath: path.basename(backupPath),
            }
          : {}),
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
        const restoration = await restorePrevious({
          backupPath,
          fileSystem,
          previousMoved,
          resolvedDirectory,
        });
        if (!restoration.restored) {
          throw createAtomicError("Restauração falhou; recuperação manual necessária", "restore", {
            packageRestored: false,
            recoveryEntry: path.basename(backupPath),
            recoveryPath: path.basename(backupPath),
            tempCleanupPending: cleanupFailed,
          });
        }
        previousMoved = restoration.method === "copy";
        if (error?.atomicSafe === true && error.recovery?.packageRestored === false) {
          throw createAtomicError("Pacote anterior restaurado após retry", "restore_retry", {
            packageRestored: true,
            restorationMethod: restoration.method,
            ...(restoration.method === "copy"
              ? {
                  recoveryEntry: path.basename(backupPath),
                  recoveryPath: path.basename(backupPath),
                }
              : {}),
            tempCleanupPending: cleanupFailed,
          });
        }
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
  if (!previousMoved) return { restored: true, method: "none" };
  try {
    await fileSystem.rename(backupPath, resolvedDirectory);
    return { restored: true, method: "rename" };
  } catch {
    try {
      await fileSystem.cp(backupPath, resolvedDirectory, { recursive: true, errorOnExist: true });
      return { restored: true, method: "copy" };
    } catch {
      return { restored: false, method: null };
    }
  }
}

async function assertNoSymlinkTree(target, fileSystem) {
  const inspection = await fileSystem.lstat(target);
  if (inspection.isSymbolicLink()) {
    throw createAtomicError("Symlink não permitido no pacote atômico", "validate_symlink");
  }
  if (!inspection.isDirectory()) return;
  const entries = await fileSystem.readdir(target);
  for (const entry of entries) {
    await assertNoSymlinkTree(path.join(target, entry), fileSystem);
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
  for (const method of ["cp", "lstat", "mkdir", "readdir", "rename", "rm", "writeFile"]) {
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

function validateRelativeFiles(files) {
  if (!Array.isArray(files)) throw new TypeError("replaceFiles deve ser array");
  for (const file of files) validateRelativePath(file);
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
