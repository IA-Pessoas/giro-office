import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import {
  type FiscalConferenceSource,
  type FiscalDocumentConference,
  fiscalConferenceService,
} from "../services/fiscalConferenceService";
import { downloadFile, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";

const SOURCES: Array<{ id: FiscalConferenceSource; label: string }> = [
  { id: "dominio", label: "Planilha Domínio" },
  { id: "sefaz", label: "Planilha SEFAZ" },
];

type Situation =
  | "Divergente"
  | "Só Domínio"
  | "Só SEFAZ"
  | "Duplicada"
  | "Erro"
  | "Descartada"
  | "Coincidente";

interface ConferenceLine {
  situation: Situation;
  identity: string;
  dominio: { line: number; value: string | null } | null;
  sefaz: { line: number; value: string | null } | null;
  note: string;
}

const SITUATIONS: Situation[] = [
  "Coincidente",
  "Divergente",
  "Só Domínio",
  "Só SEFAZ",
  "Duplicada",
  "Erro",
  "Descartada",
];

// Mesmo teto do serviço (450 mil caracteres por planilha, dentro do 1 MB do gateway).
const MAX_FILE_BYTES = 450_000;

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: string | null | undefined) => (value ? currency.format(Number(value)) : "—");

/** Mesma ordem e situações do CSV exportado pelo serviço. */
function conferenceLines(result: FiscalDocumentConference): ConferenceLine[] {
  const side = (row: { line: number; value: string | null }) => ({ line: row.line, value: row.value });
  const issue = (source: FiscalConferenceSource, line: number) =>
    source === "dominio"
      ? { dominio: { line, value: null }, sefaz: null }
      : { dominio: null, sefaz: { line, value: null } };
  return [
    ...result.matched.map((item) => ({
      situation: "Coincidente" as const,
      identity: item.identity,
      dominio: side(item.dominio),
      sefaz: side(item.sefaz),
      note: "",
    })),
    ...result.divergent.map((item) => ({
      situation: "Divergente" as const,
      identity: item.identity,
      dominio: side(item.dominio),
      sefaz: side(item.sefaz),
      note: item.differences.join(" | "),
    })),
    ...result.only_dominio.map((row) => ({
      situation: "Só Domínio" as const,
      identity: row.identity,
      dominio: side(row),
      sefaz: null,
      note: "",
    })),
    ...result.only_sefaz.map((row) => ({
      situation: "Só SEFAZ" as const,
      identity: row.identity,
      dominio: null,
      sefaz: side(row),
      note: "",
    })),
    ...result.duplicates.flatMap((item) => [
      ...item.dominio.map((row) => ({
        situation: "Duplicada" as const,
        identity: item.identity,
        dominio: side(row),
        sefaz: null,
        note: "Identidade repetida; sem correspondência automática",
      })),
      ...item.sefaz.map((row) => ({
        situation: "Duplicada" as const,
        identity: item.identity,
        dominio: null,
        sefaz: side(row),
        note: "Identidade repetida; sem correspondência automática",
      })),
    ]),
    ...result.errors.map((item) => ({
      situation: "Erro" as const,
      identity: "",
      ...issue(item.source, item.line),
      note: item.message,
    })),
    ...result.discarded.map((item) => ({
      situation: "Descartada" as const,
      identity: "",
      ...issue(item.source, item.line),
      note: item.reason,
    })),
  ];
}

export function FiscalConferencesSection({ canEdit }: { canEdit: boolean }) {
  const [files, setFiles] = useState<Partial<Record<FiscalConferenceSource, File>>>({});
  const [result, setResult] = useState<FiscalDocumentConference | null>(null);
  const [filter, setFilter] = useState<Situation | "all">("all");
  const compare = useMutation({ mutationFn: fiscalConferenceService.compareDocuments });
  const lines = useMemo(() => (result ? conferenceLines(result) : []), [result]);
  const visible = filter === "all" ? lines : lines.filter((line) => line.situation === filter);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.dominio || !files.sefaz) return;
    const tooBig = SOURCES.find((source) => (files[source.id]?.size ?? 0) > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(`${tooBig.label} excede 450 kB; divida o período em arquivos menores.`);
      return;
    }
    setResult(null);
    try {
      setResult(await compare.mutateAsync({ dominio: files.dominio, sefaz: files.sefaz }));
      setFilter("all");
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  const counts: Record<Situation, number> | null = result
    ? {
        Divergente: result.summary.divergent,
        "Só Domínio": result.summary.only_dominio,
        "Só SEFAZ": result.summary.only_sefaz,
        Duplicada: result.summary.duplicates,
        Erro: result.summary.errors,
        Descartada: result.summary.discarded,
        Coincidente: result.summary.matched,
      }
    : null;

  return (
    <section aria-labelledby="fiscal-conference-documents-title" className="space-y-4">
      <div>
        <h2 id="fiscal-conference-documents-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          Domínio × SEFAZ
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie as duas planilhas em CSV (separador ponto e vírgula, vírgula ou tab, com cabeçalho). As notas são cruzadas pela chave de acesso; sem ela, por CPF/CNPJ do emitente, modelo, série e número. Número sozinho não identifica a nota. Nada é gravado e os controles fiscais não mudam.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Compatibilidade com exportações reais ainda não validada: confira o resultado antes de usá-lo como definitivo.
        </p>
      </div>

      {canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end dark:border-slate-700">
          {SOURCES.map((source) => (
            <label key={source.id} className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {source.label}
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                required
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setFiles((current) => ({ ...current, [source.id]: file }));
                  setResult(null);
                }}
                className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`}
              />
            </label>
          ))}
          <button type="submit" disabled={!files.dominio || !files.sefaz || compare.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
            {compare.isPending ? "Conferindo..." : "Conferir"}
          </button>
        </form>
      ) : (
        <p role="note" className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-gray-400">
          Executar conferências exige permissão de edição no Fiscal.
        </p>
      )}

      {result && counts ? (
        <div className="space-y-3">
          {result.status === "partial" ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Conferência parcial: {result.summary.discarded} linha(s) descartada(s), {result.summary.errors} com erro e {result.summary.duplicates} identidade(s) duplicada(s) ficaram sem correspondência.
            </p>
          ) : (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
              Todas as linhas dos dois arquivos foram lidas e pareadas sem ambiguidade.
            </p>
          )}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {SOURCES.map((source) => {
              const info = result.sources[source.id];
              return (
                <div key={source.id} className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                  <dt className="font-medium text-gray-900 dark:text-white">{source.label}: {info.file_name}</dt>
                  <dd className="text-gray-600 dark:text-gray-400">
                    {info.accepted_rows} de {info.data_rows} linha(s) comparadas · identidade por {info.identity_columns.join(", ")}
                    {info.value_column ? ` · total ${money(result.totals[source.id])}` : " · sem coluna de valor"}
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Situação
              <select value={filter} onChange={(event) => setFilter(event.target.value as Situation | "all")} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
                <option value="all">Todas ({lines.length})</option>
                {SITUATIONS.map((situation) => (
                  <option key={situation} value={situation}>{situation} ({counts[situation]})</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => downloadFile(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), result.file_name)} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              Exportar CSV
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Resultado da conferência Domínio × SEFAZ</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Identidade</th>
                  <th className="px-4 py-2">Linha Domínio</th>
                  <th className="px-4 py-2">Valor Domínio</th>
                  <th className="px-4 py-2">Linha SEFAZ</th>
                  <th className="px-4 py-2">Valor SEFAZ</th>
                  <th className="px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {visible.map((line, index) => (
                  <tr key={`${line.situation}-${line.identity}-${line.dominio?.line ?? ""}-${line.sefaz?.line ?? ""}-${index}`} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-2">{line.situation}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.identity || "—"}</td>
                    <td className="px-4 py-2">{line.dominio?.line ?? "—"}</td>
                    <td className="px-4 py-2">{line.dominio ? money(line.dominio.value) : "—"}</td>
                    <td className="px-4 py-2">{line.sefaz?.line ?? "—"}</td>
                    <td className="px-4 py-2">{line.sefaz ? money(line.sefaz.value) : "—"}</td>
                    <td className="px-4 py-2">{line.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 ? (
              <p className="p-4 text-sm text-gray-600 dark:text-gray-400">Nenhum item nesta situação.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
