/**
 * Gera o export `giro-fiscal-history/v1` a partir da pasta do dump phpMyAdmin do `cbse`:
 *
 *   pnpm --dir services/fiscal-service exec tsx src/history/dumpToExportCli.ts \
 *     --dump <pasta com tb_fiscal.controle_impostos*.sql> --organization <uuid> --out export.json
 *
 * Não acessa banco. O arquivo gerado contém dados reais: guarde fora do repositório.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { buildFiscalHistoryExport, type LegacyFiscalDump } from "./legacyDumpExport.js";

const { values } = parseArgs({
  options: {
    dump: { type: "string" },
    organization: { type: "string" },
    out: { type: "string" },
  },
});
if (!values.dump || !values.organization || !values.out) {
  console.error("Uso: --dump <pasta> --organization <uuid> --out <export.json>");
  process.exit(2);
}

const dumpDir = values.dump;
const read = (table: keyof LegacyFiscalDump) =>
  readFileSync(join(dumpDir, `tb_fiscal.${table}.sql`), "utf8");
const file = buildFiscalHistoryExport(
  {
    controle_impostos: read("controle_impostos"),
    controle_impostos_sn: read("controle_impostos_sn"),
    controle_impostos_normal: read("controle_impostos_normal"),
    controle_impostos_mei: read("controle_impostos_mei"),
    controle_impostos_anual: read("controle_impostos_anual"),
  },
  values.organization,
);
writeFileSync(values.out, `${JSON.stringify(file, null, 2)}\n`);
const withoutDetail = file.monthly.filter((row) => !Object.keys(row.obligations).length).length;
console.log(
  `Mensal: ${file.monthly.length} (${withoutDetail} sem detalhe do regime). Anual: ${file.annual.length}. Arquivo: ${values.out}`,
);
