import pino, {
  type DestinationStream,
  type LevelWithSilent,
  type Logger as PinoLogger,
  type LoggerOptions as PinoLoggerOptions,
} from "pino";

export type Logger = PinoLogger;
export type LoggerLevel = LevelWithSilent;
export type LogLevel = Exclude<LoggerLevel, "silent">;

export interface RequestLogContext {
  id?: string;
  method?: string;
  path?: string;
  ip?: string;
}

export interface HttpLogContext {
  statusCode?: number;
  durationMs?: number;
  responseSizeBytes?: number;
}

export interface AuthLogContext {
  userId?: string;
  organizationId?: string;
  permission?: number;
}

export interface UpstreamLogContext {
  host?: string;
  method?: string;
  path?: string;
  statusCode?: number;
}

export interface CreateLoggerOptions {
  service: string;
  env?: string;
  level?: LoggerLevel;
  pretty?: boolean;
  destination?: DestinationStream | NodeJS.WritableStream;
}

const REDACTION_MASK = "[Redacted]";
const REDACT_PATHS = [
  "authorization",
  "cookie",
  'headers["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
  "data.authorization",
  "data.cookie",
  'data["set-cookie"]',
  "data.password",
  "data.token",
  "data.secret",
  "data.apiKey",
  "data.api_key",
];

function createTimestamp(): string {
  return `,"timestamp":"${new Date().toISOString()}"`;
}

function buildLoggerOptions({
  service,
  env = process.env.NODE_ENV ?? "development",
  level = "info",
}: CreateLoggerOptions): PinoLoggerOptions {
  return {
    base: {
      service,
      env,
    },
    level,
    messageKey: "message",
    timestamp: createTimestamp,
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: REDACTION_MASK,
    },
  };
}

function buildDestination({
  pretty = false,
  destination,
}: CreateLoggerOptions): DestinationStream | NodeJS.WritableStream | undefined {
  if (!pretty) {
    return destination;
  }

  return pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      singleLine: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  });
}

export function createLogger(options: CreateLoggerOptions): Logger {
  return pino(buildLoggerOptions(options), buildDestination(options));
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

let defaultLogger: Logger | null = null;

function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({
      service: process.env.LOG_SERVICE ?? "app",
      env: process.env.NODE_ENV ?? "development",
      level: (process.env.LOG_LEVEL as LoggerLevel | undefined) ?? "info",
      pretty: parseBoolean(process.env.LOG_PRETTY) && process.env.NODE_ENV !== "production",
    });
  }

  return defaultLogger;
}

export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  getDefaultLogger()[level](context ?? {}, message);
}

export function debug(message: string, context?: Record<string, unknown>): void {
  log("debug", message, context);
}

export function info(message: string, context?: Record<string, unknown>): void {
  log("info", message, context);
}

export function warn(message: string, context?: Record<string, unknown>): void {
  log("warn", message, context);
}

export function error(message: string, context?: Record<string, unknown>): void {
  log("error", message, context);
}

export function httpRequest(payload: {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  elapsedMs: number;
}): void {
  getDefaultLogger().info(
    {
      event: "http.request.completed",
      request: {
        id: payload.requestId,
        method: payload.method,
        path: payload.path,
      },
      http: {
        statusCode: payload.statusCode,
        durationMs: payload.elapsedMs,
      },
    },
    "HTTP request completed",
  );
}

export function gatewayError(payload: { requestId: string; message: string }): void {
  getDefaultLogger().error(
    {
      event: "gateway.error",
      request: {
        id: payload.requestId,
      },
    },
    payload.message,
  );
}

export function serverStart(payload: { port: number; upstream?: string }): void {
  getDefaultLogger().info(
    {
      event: "server.start",
      data: {
        port: payload.port,
      },
      upstream: payload.upstream
        ? {
            host: safeHostFromUrl(payload.upstream),
            path: safePathFromUrl(payload.upstream),
          }
        : undefined,
    },
    "Server started",
  );
}

export function serverError(message: string, err?: unknown): void {
  getDefaultLogger().error(
    {
      event: "server.error",
      err,
    },
    message,
  );
}

function safeHostFromUrl(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function safePathFromUrl(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}
