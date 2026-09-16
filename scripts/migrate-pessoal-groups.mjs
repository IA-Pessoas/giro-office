import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_OUT_DIR = "/tmp/giro-office-pessoal-group-migration";
const NO_MOVEMENT_GROUP_SYSTEM_KEY = "NO_MOVEMENT";
const PESSOAL_WRITE_PERMISSION = 2;

export function normalizePessoalGroupMigrationValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function rawValueKey(value) {
  return JSON.stringify(value ?? null);
}

function sortByLegacyValue(left, right) {
  return String(left.legacyValue ?? "").localeCompare(String(right.legacyValue ?? ""), "pt-BR");
}

function addQuarantine(quarantine, item, reason) {
  quarantine.push({
    legacyValue: item.legacyValue,
    payrollIds: item.payrollIds,
    reason,
  });
}

export function buildPessoalGroupMigrationPlan({ organizationId, payrolls, groups, mappings }) {
  const payrollsByLegacyValue = new Map();
  for (const payroll of payrolls) {
    const legacyValue = payroll.legacyGroup ?? null;
    const key = rawValueKey(legacyValue);
    const current = payrollsByLegacyValue.get(key) ?? { legacyValue, payrollIds: [] };
    current.payrollIds.push(payroll.id);
    payrollsByLegacyValue.set(key, current);
  }

  const groupsByNormalizedName = new Map();
  for (const group of groups) {
    const current = groupsByNormalizedName.get(group.normalizedName) ?? [];
    current.push(group);
    groupsByNormalizedName.set(group.normalizedName, current);
  }

  const mappingsByNormalizedValue = new Map();
  for (const mapping of mappings.filter((item) => item.organizationId === organizationId)) {
    const current = mappingsByNormalizedValue.get(mapping.normalizedValue) ?? [];
    current.push(mapping);
    mappingsByNormalizedValue.set(mapping.normalizedValue, current);
  }

  const ready = [];
  const quarantine = [];
  const entries = [...payrollsByLegacyValue.values()]
    .map((item) => ({
      ...item,
      normalizedValue: normalizePessoalGroupMigrationValue(item.legacyValue),
    }))
    .sort(sortByLegacyValue);

  for (const item of entries) {
    if (!item.normalizedValue) {
      addQuarantine(quarantine, item, "EMPTY_LEGACY_GROUP");
      continue;
    }

    const mappingCandidates = mappingsByNormalizedValue.get(item.normalizedValue) ?? [];
    if (mappingCandidates.length > 1) {
      addQuarantine(quarantine, item, "AMBIGUOUS_EXPLICIT_MAPPING");
      continue;
    }

    const groupCandidates = groupsByNormalizedName.get(item.normalizedValue) ?? [];
    if (mappingCandidates.length === 1) {
      const target = groups.find((group) => group.id === mappingCandidates[0].groupId);
      if (!target || target.archivedAt) {
        addQuarantine(quarantine, item, "INVALID_EXPLICIT_MAPPING_TARGET");
        continue;
      }
      ready.push({
        groupId: target.id,
        legacyValue: item.legacyValue,
        payrollIds: item.payrollIds,
        source: "EXPLICIT_MAPPING",
      });
      continue;
    }

    if (groupCandidates.length === 0) {
      addQuarantine(quarantine, item, "UNMAPPED_LEGACY_GROUP");
      continue;
    }
    if (groupCandidates.length > 1) {
      addQuarantine(quarantine, item, "AMBIGUOUS_CANONICAL_GROUP");
      continue;
    }

    const [target] = groupCandidates;
    if (target.archivedAt) {
      addQuarantine(quarantine, item, "ARCHIVED_CANONICAL_GROUP");
      continue;
    }
    if (target.systemKey === NO_MOVEMENT_GROUP_SYSTEM_KEY) {
      addQuarantine(quarantine, item, "NO_MOVEMENT_REQUIRES_EXPLICIT_MAPPING");
      continue;
    }
    ready.push({
      groupId: target.id,
      legacyValue: item.legacyValue,
      payrollIds: item.payrollIds,
      source: "CANONICAL_MATCH",
    });
  }

  const quarantinedPayrollIds = new Set(quarantine.flatMap((item) => item.payrollIds));
  const readyPayrollIds = new Set(ready.flatMap((item) => item.payrollIds));
  const unassignedPayrolls = payrolls.length - readyPayrollIds.size;
  const unassignedOutsideQuarantine = payrolls.filter(
    (item) => !readyPayrollIds.has(item.id) && !quarantinedPayrollIds.has(item.id),
  ).length;

  return {
    legacyPreserved: true,
    ready,
    quarantine,
    validation: {
      unassignedPayrolls,
      quarantinedPayrolls: quarantinedPayrollIds.size,
      unassignedOutsideQuarantine,
    },
  };
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} exige um valor.`);
  return value;
}

function requireOption(value, name) {
  if (!value) throw new Error(`${name} e obrigatorio.`);
  return value;
}

async function loadPg() {
  const require = createRequire(import.meta.url);
  try {
    return require("pg");
  } catch {
    const pnpmDir = path.join(ROOT, "node_modules", ".pnpm");
    const packageName = fs
      .readdirSync(pnpmDir)
      .find(
        (entry) =>
          entry.startsWith("pg@") && fs.existsSync(path.join(pnpmDir, entry, "node_modules", "pg")),
      );
    if (!packageName) throw new Error("Pacote pg nao encontrado em node_modules.");
    return require(path.join(pnpmDir, packageName, "node_modules", "pg"));
  }
}

async function readMigrationState(client, organizationId) {
  const [payrollResult, groupResult, mappingResult] = await Promise.all([
    client.query(
      'select id, "group" as legacy_group from "pessoal.payroll" where organization_id = $1 and group_id is null order by id',
      [organizationId],
    ),
    client.query(
      'select id, name, normalized_name, archived_at, system_key from "pessoal.group" where organization_id = $1 order by id',
      [organizationId],
    ),
    client.query(
      'select organization_id, legacy_value, normalized_value, group_id, mapped_by_id, mapped_at from "pessoal.group_migration_mapping" where organization_id = $1 order by id',
      [organizationId],
    ),
  ]);

  return {
    payrolls: payrollResult.rows.map((row) => ({ id: row.id, legacyGroup: row.legacy_group })),
    groups: groupResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      archivedAt: row.archived_at,
      systemKey: row.system_key,
    })),
    mappings: mappingResult.rows.map((row) => ({
      organizationId: row.organization_id,
      legacyValue: row.legacy_value,
      normalizedValue: row.normalized_value,
      groupId: row.group_id,
      mappedById: row.mapped_by_id,
      mappedAt: row.mapped_at,
    })),
  };
}

async function ensureOperator(client, organizationId, actorId) {
  const result = await client.query(
    `
      select users.id
      from users
      inner join permissions
        on permissions.user_id = users.id
        and permissions.organization_id = users.organization_id
      where users.id = $1
        and users.organization_id = $2
        and coalesce(permissions.pessoal, 0) >= $3
    `,
    [actorId, organizationId, PESSOAL_WRITE_PERMISSION],
  );
  if (result.rowCount !== 1) {
    throw new Error("Operador sem permissao de escrita de Pessoal na organizacao informada.");
  }
}

async function ensureActiveGroup(client, organizationId, groupId) {
  const result = await client.query(
    'select id from "pessoal.group" where id = $1 and organization_id = $2 and archived_at is null',
    [groupId, organizationId],
  );
  if (result.rowCount !== 1) {
    throw new Error("Grupo ativo nao encontrado na organizacao informada.");
  }
}

async function upsertMapping(
  client,
  { organizationId, legacyValue, groupId, actorId, resolutionKind },
) {
  const normalizedValue = normalizePessoalGroupMigrationValue(legacyValue);
  if (!normalizedValue) throw new Error("Valor legado vazio deve permanecer em quarentena.");

  await client.query(
    `
      insert into "pessoal.group_migration_mapping" (
        id, organization_id, legacy_value, normalized_value, group_id, mapped_by_id, mapped_at, resolution_kind
      )
      values (gen_random_uuid()::text, $1, $2, $3, $4, $5, now(), $6)
      on conflict (organization_id, normalized_value)
      do update set
        legacy_value = excluded.legacy_value,
        group_id = excluded.group_id,
        mapped_by_id = excluded.mapped_by_id,
        mapped_at = excluded.mapped_at,
        resolution_kind = excluded.resolution_kind
    `,
    [organizationId, legacyValue, normalizedValue, groupId, actorId, resolutionKind],
  );
}

async function resolveExistingGroup(client, { organizationId, actorId, legacyValue, groupId }) {
  await ensureOperator(client, organizationId, actorId);
  await ensureActiveGroup(client, organizationId, groupId);
  await upsertMapping(client, {
    organizationId,
    legacyValue,
    groupId,
    actorId,
    resolutionKind: "EXISTING_GROUP",
  });
}

async function createAndResolveGroup(client, { organizationId, actorId, legacyValue, groupName }) {
  await ensureOperator(client, organizationId, actorId);
  const normalizedName = normalizePessoalGroupMigrationValue(groupName);
  if (!normalizedName) throw new Error("--create-group exige um nome de grupo valido.");

  const existing = await client.query(
    'select id from "pessoal.group" where organization_id = $1 and normalized_name = $2',
    [organizationId, normalizedName],
  );
  if (existing.rowCount !== 0) {
    throw new Error("Ja existe um grupo com esse nome; use --map-existing.");
  }

  const displayName = groupName.trim().replace(/\s+/g, " ");
  const created = await client.query(
    'insert into "pessoal.group" (id, name, normalized_name, organization_id) values (gen_random_uuid()::text, $1, $2, $3) returning id',
    [displayName, normalizedName, organizationId],
  );
  await upsertMapping(client, {
    organizationId,
    legacyValue,
    groupId: created.rows[0].id,
    actorId,
    resolutionKind: "CREATED_GROUP",
  });
}

async function applyReadyAssignments(client, organizationId, ready) {
  let assignedPayrolls = 0;
  for (const item of ready) {
    const result = await client.query(
      `
        update "pessoal.payroll"
        set group_id = $1
        where organization_id = $2
          and group_id is null
          and id = any($3::text[])
          and exists (
            select 1
            from "pessoal.group"
            where id = $1
              and organization_id = $2
              and archived_at is null
          )
      `,
      [item.groupId, organizationId, item.payrollIds],
    );
    if (result.rowCount !== item.payrollIds.length) {
      throw new Error(
        "Folhas alteradas concorrentemente; execute um novo dry-run antes de aplicar.",
      );
    }
    assignedPayrolls += result.rowCount;
  }
  return assignedPayrolls;
}

function writeJson(outDir, file, value) {
  const output = path.join(outDir, file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(path.join(ROOT, "infra", ".env"));
  loadEnvFile(path.join(ROOT, "services", "pessoal-service", ".env"));

  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const organizationId = requireOption(
    process.env.MIGRATION_ORGANIZATION_ID,
    "MIGRATION_ORGANIZATION_ID",
  );
  const actorId = option(args, "--actor-id");
  const legacyValue = option(args, "--map-existing") ?? option(args, "--create-group");
  const existingGroupId = option(args, "--group-id");
  const createGroupName = option(args, "--create-group-name");
  const outDir = process.env.MIGRATION_OUT_DIR ?? DEFAULT_OUT_DIR;
  const hasExistingResolution = option(args, "--map-existing") !== null;
  const hasCreateResolution = option(args, "--create-group") !== null;

  if (hasExistingResolution && hasCreateResolution) {
    throw new Error("Use apenas uma resolução por execução.");
  }
  if ((hasExistingResolution || hasCreateResolution) && !apply) {
    throw new Error("Resoluções exigem --apply para registrar a decisão do operador.");
  }
  if (hasExistingResolution) {
    requireOption(actorId, "--actor-id");
    requireOption(existingGroupId, "--group-id");
  }
  if (hasCreateResolution) {
    requireOption(actorId, "--actor-id");
    requireOption(createGroupName, "--create-group-name");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL nao definida.");

  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    let resolution = null;
    if (hasExistingResolution || hasCreateResolution) {
      await client.query("begin");
      try {
        if (hasExistingResolution) {
          await resolveExistingGroup(client, {
            organizationId,
            actorId,
            legacyValue,
            groupId: existingGroupId,
          });
          resolution = "EXISTING_GROUP";
        } else {
          await createAndResolveGroup(client, {
            organizationId,
            actorId,
            legacyValue,
            groupName: createGroupName,
          });
          resolution = "CREATED_GROUP";
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    const state = await readMigrationState(client, organizationId);
    let plan = buildPessoalGroupMigrationPlan({ organizationId, ...state });
    let assignedPayrolls = 0;
    if (apply) {
      await client.query("begin");
      try {
        assignedPayrolls = await applyReadyAssignments(client, organizationId, plan.ready);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      const finalState = await readMigrationState(client, organizationId);
      plan = buildPessoalGroupMigrationPlan({ organizationId, ...finalState });
      if (plan.ready.length !== 0 || plan.validation.unassignedOutsideQuarantine !== 0) {
        throw new Error("Validacao final encontrou folhas fora da quarentena sem grupo.");
      }
    }

    const manifest = {
      mode: apply ? "apply" : "dry-run",
      organizationId,
      generatedAt: new Date().toISOString(),
      resolution,
      assignedPayrolls,
      legacyPreserved: plan.legacyPreserved,
      readyMappings: plan.ready.length,
      quarantine: plan.quarantine,
      validation: plan.validation,
    };
    writeJson(outDir, "pessoal-group-migration-plan.json", plan.ready);
    writeJson(outDir, "pessoal-group-migration-quarantine.json", plan.quarantine);
    writeJson(outDir, "pessoal-group-migration-manifest.json", manifest);
    console.log(JSON.stringify({ outDir, ...manifest }, null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
