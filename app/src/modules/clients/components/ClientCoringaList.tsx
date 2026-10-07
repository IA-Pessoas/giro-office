import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Filter, Search } from "lucide-react";

import { useCoringaClients } from "../hooks/useClients";
import { clientService } from "../services/clientService";
import type { ClientCoringaFilters, ClientCoringaRow } from "../types";
import {
  REGULARIZE_SEGMENT_OPTIONS,
  REGULARIZE_SIZE_OPTIONS,
} from "../utils/regularizeForm";
import { TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";

const indicatorFields = [
  ["contabil", "Contábil"], ["fiscal", "Fiscal"], ["pessoal", "Pessoal"],
  ["tecnologia", "Tecnologia"], ["infoproduto", "Infoproduto"],
  ["consultoria", "Consultoria"], ["licitacao", "Licitação"],
] as const;

const initialFilters = {
  search: "", regime: "", dataEntrada: "", porte: "",
  segmento: "", status: "", contabil: "", fiscal: "", pessoal: "",
  tecnologia: "", infoproduto: "", consultoria: "", licitacao: "",
};
type FilterForm = typeof initialFilters;

function toApiFilters(form: FilterForm, page: number): ClientCoringaFilters {
  const filters: ClientCoringaFilters = { page, limit: 20 };
  for (const field of ["search", "regime", "dataEntrada", "porte", "segmento", "status"] as const) {
    const value = form[field].trim();
    if (value) filters[field] = value;
  }
  for (const [field] of indicatorFields) {
    if (form[field]) filters[field] = form[field] === "true";
  }
  return filters;
}

function dateLabel(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function indicatorLabel(value: boolean | null): string {
  return value === null ? "" : value ? "Sim" : "Não";
}

function selectOptions(options: readonly string[]) {
  return options.map((option) => <option key={option} value={option}>{option}</option>);
}

export function ClientCoringaList() {
  const [draft, setDraft] = useState<FilterForm>(initialFilters);
  const [applied, setApplied] = useState<FilterForm>(initialFilters);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const filters = useMemo(() => toApiFilters(applied, page), [applied, page]);
  const { data, error, isLoading, isFetching } = useCoringaClients(filters);
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / (data?.pageSize ?? 20)));

  function update(field: keyof FilterForm, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function exportPdf() {
    setExportError("");
    setIsExporting(true);
    try {
      const blob = await clientService.downloadCoringaPdf(filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "clientes-coringa.pdf";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("Não foi possível gerar o PDF. Refine os filtros ou tente novamente.");
    } finally {
      setIsExporting(false);
    }
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white";
  const labelClass = "space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300";

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/clients" className="text-sm text-blue-600 hover:underline">← Clientes</Link>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Lista Coringa</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Visão dos clientes do Office. Data Entrada fica vazia quando a criação não é auditável.</p>
      </div>
      <button type="button" onClick={() => void exportPdf()} disabled={isExporting || isLoading}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
        <Download size={17} /> {isExporting ? "Gerando PDF…" : "Exportar PDF"}
      </button>
    </header>

    <form onSubmit={(event) => { event.preventDefault(); setApplied({ ...draft }); setPage(1); }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Filter size={17} /> Filtros</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <label className={labelClass}>Busca<input className={inputClass} value={draft.search} onChange={(event) => update("search", event.target.value)} placeholder="Empresa, CNPJ ou código" /></label>
        <label className={labelClass}>Regime<input className={inputClass} list="coringa-regimes" value={draft.regime} onChange={(event) => update("regime", event.target.value)} placeholder="Todos" /><datalist id="coringa-regimes">{selectOptions(TAX_REGIME_OPTIONS)}</datalist></label>
        <label className={labelClass}>Data Entrada<input type="date" className={inputClass} value={draft.dataEntrada} onChange={(event) => update("dataEntrada", event.target.value)} /></label>
        <label className={labelClass}>Porte<input className={inputClass} list="coringa-portes" value={draft.porte} onChange={(event) => update("porte", event.target.value)} placeholder="Todos" /><datalist id="coringa-portes">{selectOptions(REGULARIZE_SIZE_OPTIONS)}</datalist></label>
        <label className={labelClass}>Segmento<input className={inputClass} list="coringa-segmentos" value={draft.segmento} onChange={(event) => update("segmento", event.target.value)} placeholder="Todos" /><datalist id="coringa-segmentos">{selectOptions(REGULARIZE_SEGMENT_OPTIONS)}</datalist></label>
        <label className={labelClass}>Status Coringa<input className={inputClass} value={draft.status} onChange={(event) => update("status", event.target.value)} placeholder="Todos" /></label>
        {indicatorFields.map(([field, label]) => <label className={labelClass} key={field}>{label}<select className={inputClass} value={draft[field]} onChange={(event) => update(field, event.target.value)}><option value="">Todos</option><option value="true">Sim</option><option value="false">Não</option></select></label>)}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"><Search size={16} /> Aplicar filtros</button>
        <button type="button" onClick={() => { setDraft(initialFilters); setApplied(initialFilters); setPage(1); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:text-white">Limpar</button>
      </div>
    </form>

    {exportError && <p role="alert" className="text-sm text-rose-600">{exportError}</p>}
    {error && <p role="alert" className="text-sm text-rose-600">Não foi possível carregar os clientes.</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
        <span className="font-semibold text-slate-900 dark:text-white">{total} cliente{total === 1 ? "" : "s"}</span>
        {isFetching && <span className="text-slate-500">Atualizando…</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-200"><tr>
            {(["Código Domínio", "Empresa", "CNPJ", "Regime", "Data Entrada", "Porte", "Segmento", "Status", ...indicatorFields.map(([, label]) => label)]).map((label) => <th className="whitespace-nowrap px-3 py-3 font-semibold" key={label}>{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row: ClientCoringaRow) => <tr key={row.id} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/60">
              <td className="px-3 py-3">{row.dominio_code ?? ""}</td>
              <td className="px-3 py-3 font-medium"><Link href={`/clients/${row.id}`} className="text-blue-700 hover:underline dark:text-blue-300">{row.company_name?.trim() || row.name}</Link></td>
              <td className="px-3 py-3">{row.cpf_cnpj}</td><td className="px-3 py-3">{row.regime ?? ""}</td>
              <td className="px-3 py-3">{dateLabel(row.created_at)}</td><td className="px-3 py-3">{row.size ?? ""}</td>
              <td className="px-3 py-3">{row.segment ?? ""}</td><td className="px-3 py-3">{row.coringa_status ?? ""}</td>
              {indicatorFields.map(([field]) => <td className="px-3 py-3" key={field}>{indicatorLabel(row[field])}</td>)}
            </tr>)}
            {!isLoading && rows.length === 0 && <tr><td colSpan={15} className="px-4 py-10 text-center text-sm text-slate-500">Nenhum cliente encontrado para os filtros selecionados.</td></tr>}
          </tbody>
        </table>
      </div>
      {total > 0 && <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
        <span className="text-slate-500">Página {page} de {pageCount}</span>
        <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40 dark:text-white">Anterior</button><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40 dark:text-white">Próxima</button></div>
      </div>}
    </section>
  </div>;
}
