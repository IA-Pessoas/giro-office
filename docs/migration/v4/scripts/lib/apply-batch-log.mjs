import { appendFile } from "node:fs/promises";

export function serializeMigrationError(error) {
  if (error === null || error === undefined) {
    return { message: "unknown error" };
  }
  return {
    name: error.name,
    message: error.message,
    code: error.code ?? null,
    details: error.details ?? null,
    stack: typeof error.stack === "string" ? error.stack.split("\n").slice(0, 8) : null,
  };
}

export function createApplyBatchLogger(options = {}) {
  const prefix = options.prefix ?? "apply-batches";
  const logPath = options.logPath ?? null;

  async function write(level, event, context = {}) {
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event: `${prefix}:${event}`,
      ...context,
    })}\n`;
    process.stderr.write(line);
    if (logPath !== null) {
      await appendFile(logPath, line, "utf8");
    }
  }

  return {
    info: (event, context) => write("info", event, context),
    phase: (event, context) => write("phase", event, context),
    error: (event, context) => write("error", event, context),
  };
}
