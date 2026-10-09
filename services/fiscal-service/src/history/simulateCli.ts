/**
 * Simula a importação do histórico fiscal legado sem gravar nada.
 *
 *   DATABASE_URL=... pnpm --dir services/fiscal-service exec tsx src/history/simulateCli.ts \
 *     --file export.json --organization <uuid> [--out relatorio.json]
 *
 * A conexão roda numa transação READ ONLY desfeita no fim. Contrato do export:
 * docs/migration/fiscal-history-import.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

import {
  type FiscalHistoryExport,
  simulateFiscalHistoryImport,
} from "./fiscalHistorySimulation.js";
import { createPgHistoryReader, type HistoryQueryable } from "./pgHistoryReader.js";

type PgClient = HistoryQueryable & { connect(): Promise<void>; end(): Promise<void> };

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    organization: { type: "string" },
    out: { type: "string" },
  },
});
if (!values.file || !values.organization) {
  console.error("Uso: --file <export.json> --organization <uuid> [--out <relatorio.json>]");
  process.exit(2);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Defina DATABASE_URL (a conexão é aberta só para leitura).");
  process.exit(2);
}

const file = JSON.parse(readFileSync(values.file, "utf8")) as FiscalHistoryExport;
const require = createRequire(import.meta.url);
const { Client } = require("pg") as { Client: new (options: object) => PgClient };
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("begin transaction read only");
  const report = await simulateFiscalHistoryImport(
    file,
    { organizationId: values.organization },
    createPgHistoryReader(client),
  );
  console.table({ mensal: report.summary.monthly, anual: report.summary.annual });
  for (const row of [...report.monthly, ...report.annual]) {
    if (row.result !== "ACCEPTED") {
      console.log(
        `${row.result} legado ${row.legacy_id} (empresa ${row.codigo_empresa}): ${row.reason}`,
      );
    }
  }
  if (values.out) {
    writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Relatório completo em ${values.out}`);
  }
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
