/**
 * Monta o export `giro-fiscal-history/v1` a partir do dump phpMyAdmin do banco `cbse`
 * (um arquivo `.sql` por tabela). Só transforma texto: não acessa banco.
 *
 * O detalhe mensal é escolhido pelo `tipo` do cabeçalho e ligado por `id_comp`. A tabela
 * `controle_impostos_npossui` não entra: o PHP já grava `0001-01-01` no detalhe quando a
 * empresa não possui a obrigação (Fiscal::gerarControle).
 */
import { FISCAL_HISTORY_FORMAT } from "./fiscalHistorySimulation.js";

export type LegacyValue = string | number | null;
export type LegacyRow = Record<string, LegacyValue>;

export interface LegacyFiscalDump {
  controle_impostos: string;
  controle_impostos_sn: string;
  controle_impostos_normal: string;
  controle_impostos_mei: string;
  controle_impostos_anual: string;
}

const DETAIL_TABLE_BY_TIPO: Record<string, keyof LegacyFiscalDump> = {
  Completo: "controle_impostos_sn",
  Sublimite: "controle_impostos_sn",
  Normal: "controle_impostos_normal",
  MEI: "controle_impostos_mei",
};
/** Colunas do detalhe que não são obrigação. */
const DETAIL_METADATA = new Set(["id", "id_comp", "segmento", "sn_tipo"]);

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", "0": "\0", Z: "\x1a" };

/** Lê as linhas dos `INSERT INTO ... (colunas) VALUES (...), (...);` de um dump MySQL. */
export function parseInsertRows(sql: string): LegacyRow[] {
  const rows: LegacyRow[] = [];
  const header = /INSERT INTO `[^`]+` \(([^)]*)\) VALUES\s*/g;
  let match = header.exec(sql);
  while (match) {
    const columns = match[1].split(",").map((column) => column.trim().replace(/`/g, ""));
    let i = header.lastIndex;
    for (;;) {
      while (/\s|,/.test(sql[i])) i++;
      if (sql[i] !== "(") break;
      i++;
      const values: LegacyValue[] = [];
      for (;;) {
        while (sql[i] === " ") i++;
        if (sql[i] === "'") {
          let text = "";
          i++;
          for (;;) {
            const char = sql[i++];
            if (char === undefined) throw new Error("Dump truncado dentro de um texto.");
            if (char === "\\") {
              const next = sql[i++];
              text += ESCAPES[next] ?? next;
            } else if (char === "'" && sql[i] === "'") {
              text += "'";
              i++;
            } else if (char === "'") {
              break;
            } else {
              text += char;
            }
          }
          values.push(text);
        } else {
          const end = sql.slice(i).search(/[,)]/);
          const token = sql.slice(i, i + end).trim();
          i += end;
          values.push(token === "NULL" ? null : Number(token));
        }
        while (sql[i] === " ") i++;
        if (sql[i++] === ")") break;
      }
      if (values.length !== columns.length) {
        throw new Error(`Linha com ${values.length} valores para ${columns.length} colunas.`);
      }
      rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
    }
    header.lastIndex = i;
    match = header.exec(sql);
  }
  return rows;
}

const asText = (value: LegacyValue) => (value === null ? null : String(value));

export function buildFiscalHistoryExport(dump: LegacyFiscalDump, organizationId: string) {
  const details = new Map<string, Map<string, LegacyRow>>();
  for (const table of new Set(Object.values(DETAIL_TABLE_BY_TIPO))) {
    details.set(
      table,
      new Map(parseInsertRows(dump[table]).map((row) => [String(row.id_comp), row])),
    );
  }

  const monthly = parseInsertRows(dump.controle_impostos).map((row) => {
    const table = DETAIL_TABLE_BY_TIPO[String(row.tipo)];
    const detail = table ? details.get(table)?.get(String(row.id)) : undefined;
    return {
      legacy_id: row.id,
      codigo_empresa: row.codigo_empresa,
      competencia: row.competencia,
      tipo: row.tipo,
      responsavel: row.responsavel,
      obligations: Object.fromEntries(
        Object.entries(detail ?? {})
          .filter(([column]) => !DETAIL_METADATA.has(column))
          .map(([column, value]) => [column, asText(value)]),
      ),
    };
  });

  const annual = parseInsertRows(dump.controle_impostos_anual).map((row) => ({
    legacy_id: row.id,
    codigo_empresa: row.codigo_empresa,
    competencia: asText(row.competencia),
    tipo: row.tipo,
    responsavel: row.responsavel,
    defis: asText(row.defis),
    dmed: asText(row.dmed),
    dimob: asText(row.dimob),
    dirb: asText(row.dirb),
  }));

  return {
    format: FISCAL_HISTORY_FORMAT,
    organization_id: organizationId,
    client_map: [],
    monthly,
    annual,
  };
}
