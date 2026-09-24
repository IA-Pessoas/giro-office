// Cada Worker tem um schema Prisma recortado (workers/*/prisma/schema.prisma). O banco de
// produção espelha infra/prisma/schema.prisma. Quando o recorte diverge, o Prisma do Worker
// quebra em runtime e os testes unitários (Prisma mockado) não percebem:
//   - model sem @@map consultava a tabela "User" em vez de "users" (ti-service, 500 em chamados)
//   - coluna gravada pelo código e ausente no recorte ("Unknown argument `invited_by`")
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const CLIENT_DEFAULT = /@default\(\s*(?:uuid|cuid|nanoid|ulid)\([^)]*\)\s*\)|@updatedAt/u;

function parseSchema(file) {
  const source = readFileSync(file, "utf8");
  const enums = new Set([...source.matchAll(/^enum (\w+) \{/gmu)].map(([, name]) => name));
  const modelNames = new Set([...source.matchAll(/^model (\w+) \{/gmu)].map(([, name]) => name));
  const models = new Map();
  for (const [, name, body] of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gmu)) {
    const table = /@@map\("([^"]+)"\)/u.exec(body)?.[1] ?? name;
    const columns = new Map();
    for (const line of body.split("\n")) {
      const match = /^ {2}(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/u.exec(line);
      if (!match) continue;
      const [, field, type, modifier, rest] = match;
      // Relações não são colunas (lista, @relation ou tipo que é outro model).
      if (modifier === "[]" || /@relation/u.test(rest)) continue;
      if (modelNames.has(type) && !enums.has(type)) continue;
      const column = /@map\("([^"]+)"\)/u.exec(rest)?.[1] ?? field;
      columns.set(column, {
        field,
        required: modifier !== "?",
        hasDefault: /@default|@updatedAt/u.test(rest),
        // uuid()/cuid()/… e @updatedAt são preenchidos pelo Prisma Client, não pelo banco.
        clientDefault: CLIENT_DEFAULT.exec(rest)?.[0].replace(/\s+/gu, "") ?? null,
      });
    }
    const compoundNames = new Set(
      [...body.matchAll(/@@(?:unique|id)\([^)]*\bname:\s*"(\w+)"/gu)].map(([, key]) => key),
    );
    models.set(name, { table, columns, compoundNames });
  }
  return models;
}

const canonicalModels = [
  ...parseSchema(join(repoRoot, "infra", "prisma", "schema.prisma")).values(),
];
const canonicalByTable = new Map(canonicalModels.map((model) => [model.table, model.columns]));
const canonicalCompoundNames = new Map(
  canonicalModels.map((model) => [model.table, model.compoundNames]),
);

const workers = readdirSync(join(repoRoot, "workers"))
  .map((name) => ({ name, schema: join(repoRoot, "workers", name, "prisma", "schema.prisma") }))
  .filter(({ schema }) => {
    try {
      return statSync(schema).isFile();
    } catch {
      return false;
    }
  });

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "generated" || entry.name === "node_modules") return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

// Os Workers importam os serviços do Node (@workspace/<nome>/src/services/*), então o código
// que roda no Worker também vive em services/<nome>/src.
function workerSourceFiles(name) {
  const dirs = [join(repoRoot, "workers", name, "src"), join(repoRoot, "services", name, "src")];
  return dirs.flatMap((dir) => {
    try {
      return statSync(dir).isDirectory() ? sourceFiles(dir) : [];
    } catch {
      return [];
    }
  });
}

function callArguments(source, openParen) {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")" && --depth === 0) return source.slice(openParen + 1, index);
  }
  return "";
}

const PRISMA_METHODS =
  "create|createMany|update|updateMany|upsert|delete|deleteMany|findMany|findFirst|findUnique|count|aggregate|groupBy";

test("todo model de Worker aponta para uma tabela do schema canônico", () => {
  const problems = workers.flatMap(({ name, schema }) =>
    [...parseSchema(schema)]
      .filter(([, model]) => !canonicalByTable.has(model.table))
      .map(([model, { table }]) => `${name}: model ${model} -> tabela "${table}" inexistente`),
  );
  assert.deepEqual(problems, []);
});

test("toda coluna declarada por um Worker existe na tabela canônica", () => {
  const problems = workers.flatMap(({ name, schema }) =>
    [...parseSchema(schema).values()].flatMap(({ table, columns }) => {
      const canonical = canonicalByTable.get(table);
      if (!canonical) return [];
      return [...columns.keys()]
        .filter((column) => !canonical.has(column))
        .map((column) => `${name}: ${table}.${column} não existe no banco`);
    }),
  );
  assert.deepEqual(problems, []);
});

test("user-service Worker declara a permissão de personificar", () => {
  const canonical = parseSchema(join(repoRoot, "infra", "prisma", "schema.prisma"));
  const userServiceWorker = parseSchema(
    join(repoRoot, "workers", "user-service", "prisma", "schema.prisma"),
  );

  assert.ok(canonical.get("PlatformUser")?.columns.has("can_impersonate"));
  assert.ok(userServiceWorker.get("PlatformUser")?.columns.has("can_impersonate"));
});

function createdModels({ name, schema }) {
  const source = workerSourceFiles(name)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  return [...parseSchema(schema)].filter(([model, { table }]) => {
    if (!canonicalByTable.has(table)) return false;
    const delegate = model[0].toLowerCase() + model.slice(1);
    if (new RegExp(`\\.${delegate}\\s*\\.(?:create|createMany|upsert)\\(`, "u").test(source)) {
      return true;
    }
    // Acesso indireto do ti-service: `const inventory = delegate(database, "model")`.
    const aliases = source.matchAll(
      new RegExp(`(\\w+)\\s*=\\s*delegate\\([^)]*"${delegate}"\\)`, "gu"),
    );
    return [...aliases].some(([, alias]) =>
      new RegExp(`\\b${alias}\\.(?:create|createMany|upsert)\\(`, "u").test(source),
    );
  });
}

test("Worker que cria registros declara as colunas obrigatórias sem default", () => {
  const problems = workers.flatMap((worker) => {
    const { name } = worker;
    return createdModels(worker).flatMap(([, { table, columns }]) => {
      const canonical = canonicalByTable.get(table);
      return [...canonical]
        .filter(([column, info]) => info.required && !info.hasDefault && !columns.has(column))
        .map(([column]) => `${name}: cria ${table} sem declarar ${column} (NOT NULL, sem default)`);
    });
  });
  assert.deepEqual(problems, []);
});

test("Worker que cria registros repete os defaults gerados pelo Prisma Client", () => {
  // Sem o @default(uuid()) no recorte, o create sai sem id e o Prisma recusa
  // ("Argument id is missing"): a coluna não tem default no banco.
  const problems = workers.flatMap((worker) =>
    createdModels(worker).flatMap(([model, { table, columns }]) =>
      [...canonicalByTable.get(table)]
        .filter(([column, info]) => info.clientDefault && columns.has(column))
        .filter(([column, info]) => columns.get(column).clientDefault !== info.clientDefault)
        .map(
          ([column, info]) =>
            `${worker.name}: ${model}.${columns.get(column).field} sem ${info.clientDefault} (${table}.${column})`,
        ),
    ),
  );
  assert.deepEqual(problems, []);
});

test("colunas usadas nas chamadas Prisma de um Worker existem no recorte dele", () => {
  const problems = workers.flatMap(({ name, schema }) => {
    const models = parseSchema(schema);
    return workerSourceFiles(name).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [...models].flatMap(([model, { table, columns }]) => {
        const canonical = canonicalByTable.get(table);
        if (!canonical) return [];
        const missing = [...canonical.keys()].filter((column) => !columns.has(column));
        if (missing.length === 0) return [];
        const delegate = model[0].toLowerCase() + model.slice(1);
        const calls = source.matchAll(
          new RegExp(`\\.${delegate}\\.(?:${PRISMA_METHODS})\\(`, "gu"),
        );
        return [...calls].flatMap((call) => {
          const args = callArguments(source, call.index + call[0].length - 1);
          const line = source.slice(0, call.index).split("\n").length;
          return missing
            .filter((column) => new RegExp(`\\b${column}\\s*:`, "u").test(args))
            .map((column) => `${relative(repoRoot, file)}:${line} usa ${table}.${column}`);
        });
      });
    });
  });
  assert.deepEqual(problems, []);
});

test("chaves compostas nomeadas usadas pelo código existem no recorte do Worker", () => {
  // O certificate-service usava `where: { certificateNotificationIdentity: … }` num upsert,
  // mas o @@unique do recorte não tinha `name:` ("Unknown argument").
  const problems = workers.flatMap(({ name, schema }) => {
    const source = workerSourceFiles(name)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    return [...parseSchema(schema)].flatMap(([model, { table, compoundNames }]) =>
      [...(canonicalCompoundNames.get(table) ?? [])]
        .filter((key) => !compoundNames.has(key))
        .filter((key) => new RegExp(`\\b${key}\\s*:`, "u").test(source))
        .map((key) => `${name}: ${model} sem @@unique(name: "${key}") (${table})`),
    );
  });
  assert.deepEqual(problems, []);
});
