// Apoio aos testes de smoke de CRUD (workers/*/src/crud.smoke.test.ts), que rodam cada app
// em processo contra o Postgres descartável de scripts/cloudflare-smoke/crud-db.mjs.
// Sem o banco no ar, `smokeState` é null e os testes ficam em skip.
import { existsSync, readFileSync } from "node:fs";
import { hashCsrfToken } from "./session.js";

export interface CrudSmokeState {
  databaseUrl: string;
  organizationId: string;
  departmentId: string;
  ownerId: string;
  userId: string;
}

const statePath = new URL("../../../scripts/cloudflare-smoke/.crud-smoke.json", import.meta.url);

export const smokeState: CrudSmokeState | null = existsSync(statePath)
  ? (JSON.parse(readFileSync(statePath, "utf8")) as CrudSmokeState)
  : null;

/** Estado do banco do smoke; use dentro de `describe.skipIf(!smokeState)`. */
export function requireSmokeState(): CrudSmokeState {
  if (!smokeState) throw new Error("banco do smoke não está no ar");
  return smokeState;
}

export const SMOKE_INTERNAL_TOKEN = "crud-smoke-internal-token";
export const SMOKE_JWT_SECRET = "crud-smoke-jwt-secret-with-enough-length-0123456789";
const CSRF_TOKEN = "A".repeat(43);

/** Env mínimo para o Worker abrir o Prisma real no banco do smoke. */
export function smokeEnv<Env extends object>(extra: Partial<Env> = {}): Env {
  if (!smokeState) throw new Error("banco do smoke não está no ar");
  return {
    // Alguns Workers só aceitam o binding do Hyperdrive; os dois apontam para o banco local.
    HYPERDRIVE: { connectionString: smokeState.databaseUrl },
    DATABASE_URL: smokeState.databaseUrl,
    JWT_SECRET: SMOKE_JWT_SECRET,
    INTERNAL_SERVICE_TOKEN: SMOKE_INTERNAL_TOKEN,
    ...extra,
  } as Env;
}

type ModuleLevels = Record<string, number>;

const ALL_MODULES: ModuleLevels = Object.fromEntries(
  [
    "certificado",
    "comercial",
    "contabil",
    "financeiro",
    "fiscal",
    "integracao",
    "marketing",
    "parcelamento",
    "pessoal",
    "regularize",
    "rh",
    "ti",
    "triagem",
  ].map((key) => [key, 3]),
);

/** Headers que o gateway encaminha, com CSRF válido para mutações. Owner por padrão. */
export async function smokeHeaders(
  options: {
    userId?: string;
    type?: "owner" | "admin" | "user";
    modules?: ModuleLevels;
    permission?: number;
  } = {},
): Promise<Record<string, string>> {
  if (!smokeState) throw new Error("banco do smoke não está no ar");
  const userId = options.userId ?? smokeState.ownerId;
  return {
    "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
    "x-auth-user-id": userId,
    "x-auth-organization-id": smokeState.organizationId,
    "x-auth-kind": "organization",
    "x-auth-type": options.type ?? "owner",
    "x-auth-modules": JSON.stringify(options.modules ?? ALL_MODULES),
    "x-auth-permission": String(options.permission ?? 3),
    // Sessão semeada por crud-db.mjs em auth_sessions.
    "x-auth-session-id": `crud-smoke-session-${userId}`,
    "x-auth-session-version": "0",
    "x-auth-csrf-hash": await hashCsrfToken(CSRF_TOKEN),
    "x-csrf-token": CSRF_TOKEN,
    "content-type": "application/json",
  };
}

interface FetchableApp {
  request(input: string, init?: RequestInit, env?: unknown): Response | Promise<Response>;
}

export interface SmokeResponse {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: corpo JSON arbitrário da rota
  json: any;
  text: string;
}

/** Chama a rota e devolve status + JSON; falha com a mensagem do servidor em 5xx. */
export async function smokeCall(
  app: FetchableApp,
  env: unknown,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<SmokeResponse> {
  const response = await app.request(
    `https://smoke.test${path}`,
    {
      method,
      headers: headers ?? (await smokeHeaders()),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}

interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Insere um pré-requisito direto no banco (ex.: cliente para o contábil). Colunas NOT NULL
 * sem default que `row` não informa recebem um valor do tipo da coluna. Devolve a linha.
 * Use só para dados de OUTRO serviço; o CRUD do próprio Worker deve passar pelas rotas.
 */
export async function smokeInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!smokeState) throw new Error("banco do smoke não está no ar");
  const { createRequire } = await import("node:module");
  const { randomUUID } = await import("node:crypto");
  const require = createRequire(new URL("../../../infra/package.json", import.meta.url));
  const { Client } = require("pg") as { Client: new (options: object) => PgClient };
  const client = new Client({ connectionString: smokeState.databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select c.column_name, c.data_type,
              (select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
                where t.typname = c.udt_name order by e.enumsortorder limit 1) as first_label
         from information_schema.columns c
        where c.table_name = $1 and c.is_nullable = 'NO' and c.column_default is null`,
      [table],
    );
    const values: Record<string, unknown> = { organization_id: smokeState.organizationId, ...row };
    for (const column of rows) {
      const name = String(column.column_name);
      const type = String(column.data_type);
      if (name in values) continue;
      if (type.startsWith("timestamp") || type === "date") values[name] = new Date();
      else if (type === "boolean") values[name] = false;
      else if (/int|numeric|double|real/u.test(type)) values[name] = 0;
      else if (type === "uuid") values[name] = randomUUID();
      else if (type === "USER-DEFINED") values[name] = column.first_label;
      else if (type === "jsonb" || type === "json") values[name] = {};
      else values[name] = `smoke-${randomUUID().slice(0, 8)}`;
    }
    const { rows: columns } = await client.query(
      "select column_name from information_schema.columns where table_name = $1",
      [table],
    );
    const known = new Set(columns.map((column) => String(column.column_name)));
    const keys = Object.keys(values).filter((key) => known.has(key));
    const result = await client.query(
      `insert into "${table}" (${keys.map((key) => `"${key}"`).join(", ")})
       values (${keys.map((_, index) => `$${index + 1}`).join(", ")}) returning *`,
      keys.map((key) => values[key]),
    );
    return result.rows[0] ?? {};
  } finally {
    await client.end();
  }
}

/** Espera um status de sucesso; 5xx e status inesperado falham com o corpo. */
export function expectOk(result: SmokeResponse, context: string, allowed: number[] = [200, 201]) {
  if (!allowed.includes(result.status)) {
    throw new Error(`${context}: HTTP ${result.status} ${result.text.slice(0, 1200)}`);
  }
  return result.json;
}
