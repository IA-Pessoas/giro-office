import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { type FiscalSpedConference, fiscalConferenceService } from "../services/fiscalConferenceService";
import { downloadFile, formatMoney, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";

// Mesmos tetos do serviço: arquivo SPED e ZIP dividem o 1 MB do gateway.
const MAX_SPED_BYTES = 300_000;
const MAX_ZIP_BYTES = 450_000;

interface Line {
  level: "Documento" | "Item" | "Arquivo";
  situation: string;
  identity: string;
  matchKey: string;
  item: string;
  spedLine: string;
  spedValue: string | null;
  xmlFile: string;
  xmlValue: string | null;
  note: string;
}

const money = (value: string | null | undefined) => formatMoney(value);
const blank = { matchKey: "", item: "", spedLine: "", spedValue: null, xmlFile: "", xmlValue: null };

/** Mesma ordem do CSV exportado: documento seguido dos seus itens, depois erros e descartes. */
function conferenceLines(result: FiscalSpedConference): Line[] {
  const pairs = (situation: string, list: FiscalSpedConference["matched"]): Line[] =>
    list.flatMap((pair) => [
      { level: "Documento" as const, situation, identity: pair.identity, matchKey: pair.match_key, item: "", spedLine: String(pair.sped.line), spedValue: pair.sped.value, xmlFile: pair.xml.entry, xmlValue: pair.xml.value, note: [...pair.differences, ...(pair.items_compared ? [] : ["SPED sem C170 para a nota; itens não comparados"])].join(" | ") },
      ...pair.items.map((item) => ({ level: "Item" as const, situation: item.situation, identity: pair.identity, matchKey: "", item: item.number, spedLine: item.sped ? String(item.sped.line) : "", spedValue: item.sped?.value ?? null, xmlFile: item.xml ? pair.xml.entry : "", xmlValue: item.xml?.value ?? null, note: [...item.differences, item.note].filter(Boolean).join(" | ") })),
    ]);
  const groups = (situation: string, list: FiscalSpedConference["duplicates"], note: (index: number) => string): Line[] =>
    list.map((group, index) => ({ ...blank, level: "Documento" as const, situation, identity: group.identity, spedLine: group.sped.map((doc) => doc.line).join(" | "), xmlFile: group.xml.map((doc) => doc.entry).join(" | "), note: note(index) }));
  const issue = (item: FiscalSpedConference["errors"][number] | FiscalSpedConference["discarded"][number]) =>
    item.source === "sped" ? { spedLine: String(item.line), xmlFile: "" } : { spedLine: "", xmlFile: item.entry };
  return [
    ...pairs("Coincidente", result.matched),
    ...pairs("Divergente", result.divergent),
    ...result.only_sped.map((doc) => ({ ...blank, level: "Documento" as const, situation: "Só SPED", identity: doc.identity, spedLine: String(doc.line), spedValue: doc.value, note: `${doc.items.length} item(ns)` })),
    ...result.only_xml.map((doc) => ({ ...blank, level: "Documento" as const, situation: "Só XML", identity: doc.identity, xmlFile: doc.entry, xmlValue: doc.value, note: `${doc.items.length} item(ns)` })),
    ...groups("Não comparável", result.not_comparable, (index) => result.not_comparable[index]?.reason ?? ""),
    ...groups("Duplicado", result.duplicates, () => "Identidade repetida; sem correspondência automática"),
    ...result.errors.map((item) => ({ ...blank, level: "Arquivo" as const, situation: "Erro", identity: "", ...issue(item), note: item.message })),
    ...result.discarded.map((item) => ({ ...blank, level: "Arquivo" as const, situation: "Descartado", identity: "", ...issue(item), note: item.reason })),
  ];
}

export function FiscalSpedXmlSection({ canEdit }: { canEdit: boolean }) {
  const [sped, setSped] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [result, setResult] = useState<FiscalSpedConference | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const compare = useMutation({ mutationFn: fiscalConferenceService.compareSpedXml });
  const lines = useMemo(() => (result ? conferenceLines(result) : []), [result]);
  const visible = onlyProblems ? lines.filter((line) => line.situation !== "Coincidente") : lines;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sped || !xml) return;
    if (sped.size > MAX_SPED_BYTES || xml.size > MAX_ZIP_BYTES) {
      toast.error("SPED acima de 300 kB ou ZIP acima de 450 kB; divida o período em arquivos menores.");
      return;
    }
    setResult(null);
    try {
      setResult(await compare.mutateAsync({ sped, xml }));
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    <section aria-labelledby="fiscal-sped-xml-title" className="space-y-4">
      <div>
        <h2 id="fiscal-sped-xml-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          SPED C100/C170 × XML
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie o arquivo SPED EFD ICMS/IPI (registros 0000, 0150, C100 e C170) e um ZIP com os XML de NF-e ou NFC-e. Cada item C170 é comparado só com os itens da nota do seu C100; item fora de um C100 aparece como erro. Nada é gravado.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Compatibilidade com arquivos reais ainda não validada: confira o resultado antes de usá-lo como definitivo.
        </p>
      </div>

      {canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end dark:border-slate-700">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Arquivo SPED (TXT)
            <input type="file" accept=".txt,text/plain" required onChange={(event) => { setSped(event.target.files?.[0] ?? null); setResult(null); }} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            XML de NF-e (ZIP)
            <input type="file" accept=".zip,application/zip" required onChange={(event) => { setXml(event.target.files?.[0] ?? null); setResult(null); }} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} py-1.5 text-sm`} />
          </label>
          <button type="submit" disabled={!sped || !xml || compare.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
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
              Conferência parcial: {result.summary.errors} erro(s) de leiaute ou arquivo e {result.summary.duplicates} documento(s) duplicado(s){result.sources.xml.nfe_entries === 0 ? "; o ZIP não tem NF-e" : ""}.
            </p>
          ) : (
            <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200">
              Todos os registros e XML foram lidos sem erro.
            </p>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">Identidade: {result.identity_rule}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {result.sources.sped.file_name}{result.sources.sped.period ? ` (${result.sources.sped.period})` : ""}: {result.sources.sped.documents} C100, {result.sources.sped.items} C170 · documentos {money(result.totals.sped_documents)}, itens comparados {money(result.totals.sped_items)} · {result.sources.xml.file_name}: {result.sources.xml.nfe_entries} NF-e · documentos {money(result.totals.xml_documents)}, itens comparados {money(result.totals.xml_items)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Documentos: {result.summary.matched} coincidente(s), {result.summary.divergent} divergente(s), {result.summary.only_sped} só SPED, {result.summary.only_xml} só XML, {result.summary.not_comparable} não comparável(is) · Itens: {result.summary.items_matched} coincidente(s), {result.summary.items_divergent} divergente(s), {result.summary.items_only_sped} só SPED, {result.summary.items_only_xml} só XML, {result.summary.items_duplicates} duplicado(s)
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} />
              Ocultar coincidentes
            </label>
            <button type="button" onClick={() => downloadFile(new Blob([result.csv], { type: "text/csv;charset=utf-8" }), result.file_name)} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
              Exportar CSV
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Resultado da conferência SPED × XML</caption>
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Nível</th>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Identidade</th>
                  <th className="px-4 py-2">Chave usada</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Linha SPED</th>
                  <th className="px-4 py-2">Valor SPED</th>
                  <th className="px-4 py-2">Arquivo XML</th>
                  <th className="px-4 py-2">Valor XML</th>
                  <th className="px-4 py-2">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {visible.map((line, index) => (
                  <tr key={`${line.level}-${line.situation}-${line.identity}-${line.item}-${line.spedLine}-${line.xmlFile}-${index}`} className={line.level === "Item" ? "text-gray-700 dark:text-gray-300" : "font-medium text-gray-900 dark:text-gray-100"}>
                    <td className={line.level === "Item" ? "py-2 pl-8 pr-4" : "px-4 py-2"}>{line.level}</td>
                    <td className="px-4 py-2">{line.situation}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.identity || "—"}</td>
                    <td className="px-4 py-2">{line.matchKey || "—"}</td>
                    <td className="px-4 py-2">{line.item || "—"}</td>
                    <td className="px-4 py-2">{line.spedLine || "—"}</td>
                    <td className="px-4 py-2">{money(line.spedValue)}</td>
                    <td className="px-4 py-2">{line.xmlFile || "—"}</td>
                    <td className="px-4 py-2">{money(line.xmlValue)}</td>
                    <td className="px-4 py-2">{line.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
