/**
 * Simulação da importação do histórico fiscal legado (PHP, banco `cbse`) para os controles
 * mensal e anual. Só lê: o leitor recebido expõe apenas consultas, e o resultado é um
 * relatório. A carga real é outra etapa (#1631), condicionada a export e destino conferidos.
 *
 * Contrato de entrada (`giro-fiscal-history/v1`), documentado em
 * docs/migration/fiscal-history-import.md:
 * - `organization_id`: organização de destino, que precisa bater com a informada na execução.
 * - `client_map`: `codigo_empresa` legado → cliente Office, explícito. Sem entrada no mapa,
 *   aceita o cliente cujo `dominio_code` for o mesmo código, só se houver exatamente um.
 * - `monthly`: `tb_fiscal.controle_impostos` + detalhe do regime (`_sn`, `_normal`, `_mei`),
 *   com cada data do detalhe em `obligations` (nome da coluna → valor bruto).
 * - `annual`: `tb_fiscal.controle_impostos_anual` (defis, dmed, dimob, dirb).
 *
 * Datas legadas: `0001-01-01` é a sentinela de campo desabilitado (não aplicável);
 * vazio/`0000-00-00` é pendente. No anual, a gravação do PHP é inconsistente
 * (`atualizarControleAnual` passa 7 valores para 6 placeholders e grava `dirbi` numa
 * tabela cuja coluna é `dirb`), então data anual não confirma cumprimento: fica como dado
 * bruto. DIRB anual nunca gera obrigação (a DIRBI vigente é mensal).
 */
import { z } from "zod";

import type { FiscalAnnualDeclarationCode } from "../services/fiscalAnnualCatalog.js";
import type { FiscalObligationCode } from "../services/fiscalObligationCatalog.js";

export const FISCAL_HISTORY_FORMAT = "giro-fiscal-history/v1";

const NOT_APPLICABLE_SENTINEL = "0001-01-01";
const PENDING_VALUES = new Set(["", "0000-00-00"]);
/** DCTF (PGD) foi substituída pela DCTFWeb para fatos geradores a partir de 01/2025. */
const DCTFWEB_FROM = "2025-01";

const legacyDateSchema = z.string().nullable();

const monthlyRowSchema = z.object({
  legacy_id: z.number().int(),
  codigo_empresa: z.number().int(),
  competencia: z.string(),
  /** MEI, Normal, Completo ou Sublimite (os dois últimos são o Simples no PHP). */
  tipo: z.string(),
  responsavel: z.union([z.string(), z.number()]).transform(String),
  obligations: z.record(legacyDateSchema),
});

const annualRowSchema = z.object({
  legacy_id: z.number().int(),
  codigo_empresa: z.number().int(),
  competencia: z.string(),
  tipo: z.string(),
  responsavel: z.union([z.string(), z.number()]).transform(String),
  defis: legacyDateSchema,
  dmed: legacyDateSchema,
  dimob: legacyDateSchema,
  dirb: legacyDateSchema,
});

/** O arquivo é validado no topo; cada linha é validada à parte e, se malformada, é ignorada. */
const exportSchema = z.object({
  format: z.literal(FISCAL_HISTORY_FORMAT),
  organization_id: z.string().uuid(),
  client_map: z.array(z.object({ legacy_code: z.number().int(), client_id: z.string().uuid() })),
  monthly: z.array(z.unknown()),
  annual: z.array(z.unknown()),
});

function rowIdentity(raw: unknown): { legacy_id: number | null; codigo_empresa: number | null } {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    legacy_id: typeof record.legacy_id === "number" ? record.legacy_id : null,
    codigo_empresa: typeof record.codigo_empresa === "number" ? record.codigo_empresa : null,
  };
}

function malformedReason(error: z.ZodError): string {
  const issue = error.issues[0];
  return `Linha malformada: ${issue.path.join(".") || "linha"} (${issue.message}).`;
}

export interface FiscalHistoryExport {
  format: typeof FISCAL_HISTORY_FORMAT;
  organization_id: string;
  client_map: Array<{ legacy_code: number; client_id: string }>;
  monthly: Array<{
    legacy_id: number;
    codigo_empresa: number;
    competencia: string;
    tipo: string;
    responsavel: string;
    obligations: Record<string, string | null>;
  }>;
  annual: Array<{
    legacy_id: number;
    codigo_empresa: number;
    competencia: string;
    tipo: string;
    responsavel: string;
    defis: string | null;
    dmed: string | null;
    dimob: string | null;
    dirb: string | null;
  }>;
}

/** Só consultas: a simulação não tem como gravar. */
export interface FiscalHistoryReader {
  clientsByIds(
    organizationId: string,
    ids: string[],
  ): Promise<Array<{ id: string; organization_id: string }>>;
  clientsByDominioCodes(
    organizationId: string,
    codes: string[],
  ): Promise<Array<{ id: string; dominio_code: string | null }>>;
  existingMonthlyControls(
    organizationId: string,
    clientIds: string[],
  ): Promise<Array<{ client_id: string; competence: string }>>;
  existingAnnualControls(
    organizationId: string,
    clientIds: string[],
  ): Promise<Array<{ client_id: string; year: number }>>;
}

export type HistoryRowResult = "ACCEPTED" | "IGNORED" | "AMBIGUOUS";
export type HistoryItemOutcome = "COMPLETED" | "PENDING" | "NOT_APPLICABLE" | "RAW_ONLY";

export interface HistoryItem {
  legacy_field: string;
  raw: string | null;
  /** Código no catálogo do Office; null quando o campo não tem correspondente. */
  code: FiscalObligationCode | FiscalAnnualDeclarationCode | null;
  outcome: HistoryItemOutcome;
  completed_on: string | null;
}

interface HistoryRowBase {
  legacy_id: number | null;
  codigo_empresa: number | null;
  result: HistoryRowResult;
  reason: string | null;
  client_id: string | null;
  mapping: "EXPLICIT" | "DOMINIO_UNIQUE" | null;
  /** Já existe controle no Office: a carga real não duplica, só completa. */
  existing_control: boolean;
  legacy_responsible: string;
  items: HistoryItem[];
}

export interface MonthlyHistoryRow extends HistoryRowBase {
  competence: string;
}

export interface AnnualHistoryRow extends HistoryRowBase {
  year: number | null;
}

type Counts = { accepted: number; ignored: number; ambiguous: number };

export interface FiscalHistorySimulationReport {
  format: typeof FISCAL_HISTORY_FORMAT;
  organization_id: string;
  monthly: MonthlyHistoryRow[];
  annual: AnnualHistoryRow[];
  summary: { monthly: Counts; annual: Counts };
}

const MONTHLY_FIELD_CODES: Record<string, Record<string, FiscalObligationCode>> = {
  // O PHP grava o Simples como Completo ou Sublimite no cabeçalho mensal.
  Completo: { das: "PGDAS_D", dirbi: "DIRBI" },
  Sublimite: { das: "PGDAS_D", dirbi: "DIRBI" },
  Normal: { sped_contribuicoes: "EFD_CONTRIBUICOES", dctf: "DCTFWEB", dirbi: "DIRBI" },
  MEI: { dirbi: "DIRBI" },
};

const ANNUAL_FIELD_CODES: Record<string, FiscalAnnualDeclarationCode | null> = {
  defis: "DEFIS",
  dmed: "DMED",
  dimob: "DIMOB",
  dirb: null,
};

function isIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function legacyOutcome(
  raw: string | null,
  dateMeans: "COMPLETED" | "RAW_ONLY",
): Pick<HistoryItem, "outcome" | "completed_on"> {
  const value = (raw ?? "").trim();
  if (value === NOT_APPLICABLE_SENTINEL) return { outcome: "NOT_APPLICABLE", completed_on: null };
  if (PENDING_VALUES.has(value)) return { outcome: "PENDING", completed_on: null };
  if (dateMeans === "COMPLETED" && isIsoDate(value)) {
    return { outcome: "COMPLETED", completed_on: value };
  }
  return { outcome: "RAW_ONLY", completed_on: null };
}

function monthlyItems(row: z.output<typeof monthlyRowSchema>, competence: string): HistoryItem[] {
  const codes = MONTHLY_FIELD_CODES[row.tipo] ?? {};
  return Object.entries(row.obligations).map(([field, raw]) => {
    let code: FiscalObligationCode | null = codes[field] ?? null;
    if (code === "DCTFWEB" && competence < DCTFWEB_FROM) code = null;
    return { legacy_field: field, raw, code, ...legacyOutcome(raw, "COMPLETED") };
  });
}

function annualItems(row: z.output<typeof annualRowSchema>): HistoryItem[] {
  return (["defis", "dmed", "dimob", "dirb"] as const).map((field) => {
    const raw = row[field];
    const code = ANNUAL_FIELD_CODES[field];
    // DIRB anual: dado bruto apenas, sem obrigação nova.
    const outcome =
      code === null
        ? { outcome: "RAW_ONLY" as const, completed_on: null }
        : legacyOutcome(raw, "RAW_ONLY");
    return { legacy_field: field, raw, code, ...outcome };
  });
}

function count(rows: HistoryRowBase[]): Counts {
  return {
    accepted: rows.filter((row) => row.result === "ACCEPTED").length,
    ignored: rows.filter((row) => row.result === "IGNORED").length,
    ambiguous: rows.filter((row) => row.result === "AMBIGUOUS").length,
  };
}

/** Linhas aceitas que caem no mesmo cliente e período viram ambíguas: nenhuma é escolhida. */
function markDuplicates<T extends HistoryRowBase>(rows: T[], period: (row: T) => string): void {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (row.result !== "ACCEPTED" || !row.client_id) continue;
    const key = `${row.client_id}|${period(row)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.result = "AMBIGUOUS";
      row.reason = `Linhas legadas duplicadas para o mesmo cliente e período (${group
        .map((entry) => entry.legacy_id)
        .join(", ")}).`;
    }
  }
}

export async function simulateFiscalHistoryImport(
  input: unknown,
  options: { organizationId: string },
  reader: FiscalHistoryReader,
): Promise<FiscalHistorySimulationReport> {
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Formato do export não reconhecido (esperado ${FISCAL_HISTORY_FORMAT}): ${malformedReason(parsed.error)}`,
    );
  }
  const file = parsed.data;
  if (!options.organizationId || file.organization_id !== options.organizationId) {
    throw new Error(
      "A organização de destino do export precisa ser informada e igual à da execução.",
    );
  }
  const organizationId = options.organizationId;

  const monthlyRows = file.monthly.map((raw) => ({ raw, parsed: monthlyRowSchema.safeParse(raw) }));
  const annualRows = file.annual.map((raw) => ({ raw, parsed: annualRowSchema.safeParse(raw) }));

  // Mapa explícito, validado contra a organização de destino. O mesmo código apontando para
  // clientes diferentes é ambíguo: nenhum é escolhido.
  const explicitTargets = new Map<number, Set<string>>();
  for (const entry of file.client_map) {
    explicitTargets.set(
      entry.legacy_code,
      new Set([...(explicitTargets.get(entry.legacy_code) ?? []), entry.client_id]),
    );
  }
  const explicit = new Map(
    [...explicitTargets].map(([code, targets]) => [code, [...targets]] as const),
  );
  const explicitIds = [...new Set(file.client_map.map((entry) => entry.client_id))];
  const validIds = new Set(
    (await reader.clientsByIds(organizationId, explicitIds)).map((client) => client.id),
  );

  // Fallback pelo código Domínio, só quando não há entrada explícita.
  const codes = [
    ...new Set(
      [...monthlyRows, ...annualRows]
        .flatMap(({ parsed }) => (parsed.success ? [parsed.data.codigo_empresa] : []))
        .filter((code) => !explicit.has(code))
        .map(String),
    ),
  ];
  const byDominio = new Map<string, string[]>();
  for (const client of await reader.clientsByDominioCodes(organizationId, codes)) {
    const key = client.dominio_code ?? "";
    byDominio.set(key, [...(byDominio.get(key) ?? []), client.id]);
  }

  const resolve = (
    code: number,
  ): Pick<HistoryRowBase, "result" | "reason" | "client_id" | "mapping"> => {
    const targets = explicit.get(code);
    if (targets && targets.length > 1) {
      return {
        result: "AMBIGUOUS",
        reason: `Mapa explícito tem ${targets.length} clientes para o código ${code}.`,
        client_id: null,
        mapping: null,
      };
    }
    const mapped = targets?.[0];
    if (mapped) {
      return validIds.has(mapped)
        ? { result: "ACCEPTED", reason: null, client_id: mapped, mapping: "EXPLICIT" }
        : {
            result: "IGNORED",
            reason: "Cliente do mapa não pertence à organização de destino.",
            client_id: null,
            mapping: null,
          };
    }
    const candidates = byDominio.get(String(code)) ?? [];
    if (candidates.length === 1) {
      return {
        result: "ACCEPTED",
        reason: null,
        client_id: candidates[0],
        mapping: "DOMINIO_UNIQUE",
      };
    }
    if (candidates.length > 1) {
      return {
        result: "AMBIGUOUS",
        reason: `Código Domínio ${code} corresponde a ${candidates.length} clientes; informe no mapa.`,
        client_id: null,
        mapping: null,
      };
    }
    return {
      result: "IGNORED",
      reason: `Sem cliente para o código ${code}: informe no mapa.`,
      client_id: null,
      mapping: null,
    };
  };

  const malformed = (raw: unknown, error: z.ZodError) => ({
    ...rowIdentity(raw),
    existing_control: false,
    legacy_responsible: "",
    result: "IGNORED" as const,
    reason: malformedReason(error),
    client_id: null,
    mapping: null,
    items: [],
  });

  const monthly: MonthlyHistoryRow[] = monthlyRows.map(({ raw, parsed: rowParse }) => {
    if (!rowParse.success) return { ...malformed(raw, rowParse.error), competence: "" };
    const row = rowParse.data;
    const competence = row.competencia.trim();
    const base = {
      legacy_id: row.legacy_id,
      codigo_empresa: row.codigo_empresa,
      competence,
      existing_control: false,
      legacy_responsible: row.responsavel,
    };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence)) {
      return {
        ...base,
        result: "IGNORED",
        reason: `Competência inválida: ${row.competencia}.`,
        client_id: null,
        mapping: null,
        items: [],
      };
    }
    return { ...base, ...resolve(row.codigo_empresa), items: monthlyItems(row, competence) };
  });

  const annual: AnnualHistoryRow[] = annualRows.map(({ raw, parsed: rowParse }) => {
    if (!rowParse.success) return { ...malformed(raw, rowParse.error), year: null };
    const row = rowParse.data;
    const year = Number(row.competencia);
    const base = {
      legacy_id: row.legacy_id,
      codigo_empresa: row.codigo_empresa,
      existing_control: false,
      legacy_responsible: row.responsavel,
    };
    if (!/^\d{4}$/.test(row.competencia.trim()) || year < 2000 || year > 2100) {
      return {
        ...base,
        year: null,
        result: "IGNORED",
        reason: `Ano inválido: ${row.competencia}.`,
        client_id: null,
        mapping: null,
        items: [],
      };
    }
    return { ...base, year, ...resolve(row.codigo_empresa), items: annualItems(row) };
  });

  markDuplicates(monthly, (row) => row.competence);
  markDuplicates(annual, (row) => String(row.year));

  // Controles que já existem no Office: a carga real não os duplica.
  const clientIds = [
    ...new Set([...monthly, ...annual].flatMap((row) => (row.client_id ? [row.client_id] : []))),
  ];
  const monthlyExisting = new Set(
    (await reader.existingMonthlyControls(organizationId, clientIds)).map(
      (entry) => `${entry.client_id}|${entry.competence}`,
    ),
  );
  const annualExisting = new Set(
    (await reader.existingAnnualControls(organizationId, clientIds)).map(
      (entry) => `${entry.client_id}|${entry.year}`,
    ),
  );
  for (const row of monthly) {
    row.existing_control =
      Boolean(row.client_id) && monthlyExisting.has(`${row.client_id}|${row.competence}`);
  }
  for (const row of annual) {
    row.existing_control =
      Boolean(row.client_id) && annualExisting.has(`${row.client_id}|${row.year}`);
  }

  return {
    format: FISCAL_HISTORY_FORMAT,
    organization_id: organizationId,
    monthly,
    annual,
    summary: { monthly: count(monthly), annual: count(annual) },
  };
}
