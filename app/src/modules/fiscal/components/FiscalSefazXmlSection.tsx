import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import {
  type FiscalConferenceRow,
  type FiscalSefazXmlConference,
  type FiscalXmlNoteRow,
  fiscalConferenceService,
} from "../services/fiscalConferenceService";
import { downloadFile, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";

// Mesmos tetos do serviço: planilha e ZIP dividem o 1 MB do gateway.
const MAX_SPREADSHEET_BYTES = 300_000;
const MAX_ZIP_BYTES = 450_000;

const SITUATIONS = [
  "Coincidente",
  "Divergente",
  "Só SEFAZ",
  "Só XML",
  "Não comparável",
  "Duplicada",
  "Erro",
  "Descartada",
] as const;
type Situation = (typeof SITUATIONS)[number];

interface Line {
  situation: Situation;
  identity: string;
  matchKey: string;
  sefaz: string;
  xml: string;
  note: string;
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: string | null) => (value ? currency.format(Number(value)) : "sem valor");
const sefazText = (rows: FiscalConferenceRow[]) => rows.map((row) => `linha ${row.line} · ${money(row.value)}`).join(" | ");
const xmlText = (rows: FiscalXmlNoteRow[]) => rows.map((row) => `${row.entry} · ${money(row.value)}`).join(" | ");

/** Mesma ordem e situações do CSV exportado pelo serviço. */
function conferenceLines(result: FiscalSefazXmlConference): Line[] {
  const issueSide = (issue: { source: "sefaz"; line: number } | { source: "xml"; entry: string }) =>
    issue.source === "sefaz" ? { sefaz: `linha ${issue.line}`, xml: "" } : { sefaz: "", xml: issue.entry };
  return [
    ...result.matched.map((item) => ({ situation: "Coincidente" as const, identity: item.identity, matchKey: item.match_key, sefaz: sefazText([item.sefaz]), xml: xmlText([item.xml]), note: item.notes.join(" | ") })),
    ...result.divergent.map((item) => ({ situation: "Divergente" as const, identity: item.identity, matchKey: item.match_key, sefaz: sefazText([item.sefaz]), xml: xmlText([item.xml]), note: [...item.differences, ...item.notes].join(" | ") })),
    ...result.only_sefaz.map((row) => ({ situation: "Só SEFAZ" as const, identity: row.identity, matchKey: "", sefaz: sefazText([row]), xml: "", note: "" })),
    ...result.only_xml.map((row) => ({ situation: "Só XML" as const, identity: row.identity, matchKey: "", sefaz: "", xml: xmlText([row]), note: "" })),
    ...result.not_comparable.map((item) => ({ situation: "Não comparável" as const, identity: item.identity, matchKey: "", sefaz: sefazText(item.sefaz), xml: xmlText(item.xml), note: item.reason })),
    ...result.duplicates.map((item) => ({ situation: "Duplicada" as const, identity: item.identity, matchKey: "", sefaz: sefazText(item.sefaz), xml: xmlText(item.xml), note: "Identidade repetida; sem correspondência automática" })),
    ...result.errors.map((item) => ({ situation: "Erro" as const, identity: "", matchKey: "", ...issueSide(item), note: item.message })),
    ...result.discarded.map((item) => ({ situation: "Descartada" as const, identity: "", matchKey: "", ...issueSide(item), note: item.reason })),
  ];
}

export function FiscalSefazXmlSection({ canEdit }: { canEdit: boolean }) {
  const [sefaz, setSefaz] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [result, setResult] = useState<FiscalSefazXmlConference | null>(null);
  const [filter, setFilter] = useState<Situation | "all">("all");
  const compare = useMutation({ mutationFn: fiscalConferenceService.compareSefazXml });
  const lines = useMemo(() => (result ? conferenceLines(result) : []), [result]);
  const visible = filter === "all" ? lines : lines.filter((line) => line.situation === filter);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sefaz || !xml) return;
    if (sefaz.size > MAX_SPREADSHEET_BYTES || xml.size > MAX_ZIP_BYTES) {
      toast.error("Planilha acima de 300 kB ou ZIP acima de 450 kB; divida o período em arquivos menores.");
      return;
    }
    setResult(null);
    try {
      setResult(await compare.mutateAsync({ sefaz, xml }));
      setFilter("all");
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  const count = (situation: Situation) => lines.filter((line) => line.situation === situation).length;

  return (
    <section aria-labelledby="fiscal-sefaz-xml-title" className="space-y-4">
      <div>
        <h2 id="fiscal-sefaz-xml-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          CSV SEFAZ × XML
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie a planilha CSV da SEFAZ e um ZIP com os XML de NF-e ou NFC-e. As notas são pareadas pela chave de acesso ou por emitente, modelo, série e número; canceladas ou denegadas ficam como não comparáveis, separadas das ausências reais. Nada é gravado.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Compatibilidade com exportações reais ainda não validada: confira o resultado antes de usá-lo como definitivo.
        </p>
      </div>

      {canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end dark:border-slate-700">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Planilha SEFAZ (CSV)
            <input type="file" accept=".csv,.txt,text/csv,text/plain" required onChange={(event) => { setSefaz(event.target.files?.[0] ?? null); setResult(null); }} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            XML de NF-e (ZIP)
            <input type="file" accept=".zip,application/zip" required onChange={(event) => { setXml(event.target.files?.[0] ?? null); setResult(null); }} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`} />
          </label>
          <button type="submit" disabled={!sefaz || !xml || compare.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
            {compare.isPending ? "Conferindo..." : "Conferir"}
          </button>
        </form>
      ) : (
        <p role="note" className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 dark:border-slate-700 dark:text-gray-400">
          Executar conferências exige permissão de edição no Fiscal.
        </p>
      )}

      {result ? (
        <div className="space-y-3">
          {result.status === "partial" ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Conferência parcial: {result.summary.discarded} descarte(s), {result.summary.errors} erro(s) e {result.summary.duplicates} identidade(s) duplicada(s) ficaram sem correspondência.
            </p>
          ) : (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
              Todas as linhas e XML foram lidos e pareados sem ambiguidade.
            </p>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">Identidade: {result.identity_rule}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {result.sources.sefaz.file_name}: {result.sources.sefaz.accepted_rows} de {result.sources.sefaz.data_rows} linha(s){result.totals.sefaz ? ` · total ${money(result.totals.sefaz)}` : ""} · {result.sources.xml.file_name}: {result.sources.xml.nfe_entries} NF-e em {result.sources.xml.entries} arquivo(s){result.totals.xml ? ` · total ${money(result.totals.xml)}` : ""}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Situação
              <select value={filter} onChange={(event) => setFilter(event.target.value as Situation | "all")} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
                <option value="all">Todas ({lines.length})</option>
                {SITUATIONS.map((situation) => <option key={situation} value={situation}>{situation} ({count(situation)})</option>)}
              </select>
            </label>
            <button type="button" onClick={() => downloadFile(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), result.file_name)} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              Exportar CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Resultado da conferência CSV SEFAZ × XML</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Identidade</th>
                  <th className="px-4 py-2">Chave usada</th>
                  <th className="px-4 py-2">SEFAZ</th>
                  <th className="px-4 py-2">XML</th>
                  <th className="px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {visible.map((line, index) => (
                  <tr key={`${line.situation}-${line.identity}-${line.sefaz}-${line.xml}-${index}`} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-2">{line.situation}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.identity || "—"}</td>
                    <td className="px-4 py-2">{line.matchKey || "—"}</td>
                    <td className="px-4 py-2">{line.sefaz || "—"}</td>
                    <td className="px-4 py-2">{line.xml || "—"}</td>
                    <td className="px-4 py-2">{line.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 ? <p className="p-4 text-sm text-gray-600 dark:text-gray-400">Nenhum item nesta situação.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
