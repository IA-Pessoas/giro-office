/**
 * Logger padronizado para o workspace.
 * Saída em JSON estruturado para facilitar agregação e parsing em produção.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message?: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, payload: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    ...payload,
  };
  return JSON.stringify(entry);
}

function write(level: LogLevel, payload: Record<string, unknown>): void {
  const line = formatEntry(level, payload);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * Log genérico com nível e payload customizável.
 */
export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  write(level, { message, ...context });
}

/**
 * Log de nível info.
 */
export function info(message: string, context?: Record<string, unknown>): void {
  log("info", message, context);
}

/**
 * Log de nível error.
 */
export function error(message: string, context?: Record<string, unknown>): void {
  log("error", message, context);
}

/**
 * Log de nível warn.
 */
export function warn(message: string, context?: Record<string, unknown>): void {
  log("warn", message, context);
}

/**
 * Log de nível debug.
 */
export function debug(message: string, context?: Record<string, unknown>): void {
  log("debug", message, context);
}

/**
 * Log estruturado de requisição HTTP (para middlewares).
 */
export function httpRequest(payload: {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  elapsedMs: number;
}): void {
  write("info", {
    type: "http_request",
    ...payload,
  });
}

/**
 * Log estruturado de erro no gateway.
 */
export function gatewayError(payload: { requestId: string; message: string }): void {
  write("error", {
    type: "gateway_error",
    ...payload,
  });
}

/**
 * Log estruturado de startup do servidor.
 */
export function serverStart(payload: { port: number; upstream?: string }): void {
  write("info", {
    type: "server_start",
    message: `Gateway ativo na porta ${payload.port}`,
    ...payload,
  });
}

/**
 * Log estruturado de erro fatal no servidor.
 */
export function serverError(message: string, err?: unknown): void {
  const context: Record<string, unknown> = { type: "server_error" };
  if (err instanceof Error) {
    context.stack = err.stack;
  } else if (err !== undefined) {
    context.error = String(err);
  }
  write("error", { message, ...context });
}
