import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";

import { Dialog } from "@shared/components";

import { useMarketingEventEditions, useSaveMarketingEventEdition } from "../hooks/useMarketingEventEditions";
import type { MarketingEvent } from "../types/marketingEvent";
import type { MarketingEditionLists, MarketingEventEdition, MarketingEventEditionPayload } from "../types/marketingEventEdition";
import { marketingFormControlClass, marketingFormTextareaClass } from "./marketingFormStyles";

const planningGroups = [
  { key: "logistics", title: "Logística", fields: [["fornecedores", "Fornecedores"], ["cronograma", "Cronograma"], ["registro", "Registro"], ["transporte", "Transporte"], ["acomodacoes", "Acomodações"]] },
  { key: "marketingCommunication", title: "Marketing e comunicação", fields: [["abertura", "Abertura"], ["divulgacao", "Divulgação"], ["acessoria", "Assessoria de imprensa"], ["site", "Site"]] },
  { key: "duringEvent", title: "Durante o evento", fields: [["recepcao", "Recepção"], ["staff", "Equipe"], ["programacao", "Programação"], ["feedback", "Feedback"]] },
  { key: "afterEvent", title: "Após o evento", fields: [["avaliacao", "Avaliação"], ["agradecimento", "Agradecimento"], ["relatorio", "Relatório"], ["followup", "Acompanhamento"]] },
] as const;

type PlanningKey = (typeof planningGroups)[number]["key"];
type BudgetDraft = MarketingEventEditionPayload["budgetItems"][number];

function emptyLists(keys: readonly string[]): MarketingEditionLists {
  return Object.fromEntries(keys.map((key) => [key, []]));
}

function emptyDraft(): MarketingEventEditionPayload {
  return {
    name: "", date: "", place: "", budgetItems: [], partnerships: [], organizingTeam: [],
    logistics: emptyLists(planningGroups[0].fields.map(([key]) => key)),
    marketingCommunication: emptyLists(planningGroups[1].fields.map(([key]) => key)),
    duringEvent: emptyLists(planningGroups[2].fields.map(([key]) => key)),
    afterEvent: emptyLists(planningGroups[3].fields.map(([key]) => key)), notes: "",
  };
}

function parseList(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function listValue(items: string[]): string {
  return items.join("\n");
}

function toCents(amount: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/u.test(amount)) return 0n;
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function formatCents(cents: bigint): string {
  const whole = new Intl.NumberFormat("pt-BR").format(cents / 100n);
  return `R$ ${whole},${(cents % 100n).toString().padStart(2, "0")}`;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return "Não foi possível salvar a edição. Confira os dados e tente novamente.";
}

function toDraft(edition: MarketingEventEdition): MarketingEventEditionPayload {
  return {
    name: edition.name,
    date: edition.date,
    place: edition.place,
    budgetItems: edition.budgetItems.map(({ name, amount }) => ({ name, amount })),
    partnerships: edition.partnerships,
    organizingTeam: edition.organizingTeam,
    logistics: edition.logistics,
    marketingCommunication: edition.marketingCommunication,
    duringEvent: edition.duringEvent,
    afterEvent: edition.afterEvent,
    notes: edition.notes,
  };
}

export function MarketingEventEditions({
  event,
  open,
  onOpenChange,
  canEdit,
}: {
  event: MarketingEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}) {
  const query = useMarketingEventEditions(event.id, open);
  const saveMutation = useSaveMarketingEventEdition(event.id);
  const [editing, setEditing] = useState<MarketingEventEdition | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [formError, setFormError] = useState("");
  const isSaving = saveMutation.isPending;
  const totalCents = draft.budgetItems.reduce((sum, item) => sum + toCents(item.amount.replace(",", ".")), 0n);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setFormOpen(false);
      setDraft(emptyDraft());
      setFormError("");
    }
  }, [open]);

  function startCreate() {
    setEditing(null);
    setFormOpen(true);
    setDraft(emptyDraft());
    setFormError("");
  }

  function startEdit(edition: MarketingEventEdition) {
    setEditing(edition);
    setFormOpen(true);
    setDraft(toDraft(edition));
    setFormError("");
  }

  async function save(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setFormError("");
    try {
      await saveMutation.mutateAsync({
        ...(editing ? { editionId: editing.id } : {}),
        payload: { ...draft, budgetItems: draft.budgetItems.map((item) => ({ ...item, amount: item.amount.replace(",", ".") })) },
      });
      setEditing(null);
      setFormOpen(false);
      setDraft(emptyDraft());
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    }
  }

  function changePlanning(section: PlanningKey, category: string, value: string) {
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], [category]: parseList(value) },
    }));
  }

  function changeBudget(index: number, key: keyof BudgetDraft, value: string) {
    setDraft((current) => ({
      ...current,
      budgetItems: current.budgetItems.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  const editions = query.data ?? [];

  return (
    <Dialog
      contentClassName="w-[min(96vw,1000px)]"
      description={`Edições e planejamento de ${event.name}`}
      footer={formOpen ? (
        <>
          <button className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700" disabled={isSaving} onClick={() => { setFormOpen(false); setEditing(null); setFormError(""); }} type="button">Cancelar</button>
          {canEdit ? <button className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} form="marketing-event-edition-form" type="submit">{isSaving ? "Salvando…" : editing ? "Salvar edição" : "Nova edição"}</button> : null}
        </>
      ) : null}
      onOpenChange={onOpenChange}
      open={open}
      title={`Edições · ${event.name}`}
    >
      {query.isLoading ? <p aria-live="polite" className="text-sm text-gray-600 dark:text-slate-300" role="status">Carregando edições…</p> : null}
      {query.isError ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">Não foi possível carregar as edições. Feche e tente novamente.</p> : null}
      {!query.isLoading && !query.isError && !formOpen ? (
        <div className="space-y-4">
          {canEdit ? <div className="flex justify-end"><button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={startCreate} type="button"><Plus aria-hidden="true" className="h-4 w-4" />Adicionar edição</button></div> : null}
          {editions.length === 0 ? <p className="rounded-lg bg-gray-50 px-4 py-6 text-sm text-gray-600 dark:bg-slate-800 dark:text-slate-300">Nenhuma edição cadastrada para este evento.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-300"><th className="px-3 py-2 font-semibold">Edição</th><th className="px-3 py-2 font-semibold">Data</th><th className="px-3 py-2 font-semibold">Local</th><th className="px-3 py-2 text-right font-semibold">Orçamento</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>{editions.map((edition) => <tr className="border-b border-gray-100 last:border-0 dark:border-slate-800" key={edition.id}>
                  <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{edition.name}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${edition.date}T00:00:00Z`))}</td>
                  <td className="px-3 py-3 text-gray-700 dark:text-slate-200">{edition.place}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-slate-200">{formatCents(toCents(edition.budgetTotal))}</td>
                  <td className="px-3 py-3 text-right">{canEdit ? <button aria-label={`Editar edição ${edition.name}`} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" onClick={() => startEdit(edition)} type="button"><Pencil aria-hidden="true" className="h-4 w-4" /></button> : null}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {canEdit && formOpen ? (
        <form className="space-y-5" id="marketing-event-edition-form" onSubmit={save}>
          {formError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">{formError}</p> : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200 sm:col-span-1" htmlFor="edition-name">Nome da edição *<input className={marketingFormControlClass} id="edition-name" maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required value={draft.name} /></label>
            <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="edition-date">Data *<input className={marketingFormControlClass} id="edition-date" onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} required type="date" value={draft.date} /></label>
            <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="edition-place">Local *<input className={marketingFormControlClass} id="edition-place" maxLength={255} onChange={(event) => setDraft((current) => ({ ...current, place: event.target.value }))} required value={draft.place} /></label>
          </div>

          <section aria-labelledby="edition-budget-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-gray-900 dark:text-white" id="edition-budget-heading">Orçamento <span className="ml-2 text-sm font-normal text-gray-600 dark:text-slate-300">Total: {formatCents(totalCents)}</span></h3><button className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => setDraft((current) => ({ ...current, budgetItems: [...current.budgetItems, { name: "", amount: "" }] }))} type="button"><Plus aria-hidden="true" className="h-4 w-4" />Item</button></div>
            {draft.budgetItems.length === 0 ? <p className="text-sm text-gray-600 dark:text-slate-300">Nenhum item de orçamento.</p> : draft.budgetItems.map((item, index) => <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]" key={`budget-${index}`}>
              <label className="sr-only" htmlFor={`budget-name-${index}`}>Item de orçamento</label><input className={marketingFormControlClass} id={`budget-name-${index}`} maxLength={100} onChange={(event) => changeBudget(index, "name", event.target.value)} placeholder="Descrição" required value={item.name} />
              <label className="sr-only" htmlFor={`budget-amount-${index}`}>Valor em reais</label><input className={marketingFormControlClass} id={`budget-amount-${index}`} inputMode="decimal" onChange={(event) => changeBudget(index, "amount", event.target.value)} placeholder="0,00" required value={item.amount} />
              <button aria-label={`Remover item ${index + 1}`} className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setDraft((current) => ({ ...current, budgetItems: current.budgetItems.filter((_, itemIndex) => itemIndex !== index) }))} type="button"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
            </div>)}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="edition-partnerships">Parcerias <span className="font-normal text-gray-500 dark:text-slate-400">(uma por linha)</span><textarea className={marketingFormTextareaClass} id="edition-partnerships" onChange={(event) => setDraft((current) => ({ ...current, partnerships: parseList(event.target.value) }))} value={listValue(draft.partnerships)} /></label>
            <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="edition-team">Equipe organizadora <span className="font-normal text-gray-500 dark:text-slate-400">(uma por linha)</span><textarea className={marketingFormTextareaClass} id="edition-team" onChange={(event) => setDraft((current) => ({ ...current, organizingTeam: parseList(event.target.value) }))} value={listValue(draft.organizingTeam)} /></label>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {planningGroups.map((group) => <section aria-labelledby={`edition-${group.key}-heading`} className="space-y-3" key={group.key}><h3 className="font-semibold text-gray-900 dark:text-white" id={`edition-${group.key}-heading`}>{group.title}</h3><div className="grid gap-3 sm:grid-cols-2">{group.fields.map(([key, label]) => <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor={`edition-${group.key}-${key}`} key={key}>{label}<textarea className={`${marketingFormTextareaClass} min-h-20`} id={`edition-${group.key}-${key}`} onChange={(event) => changePlanning(group.key, key, event.target.value)} value={listValue(draft[group.key][key] ?? [])} /></label>)}</div></section>)}
          </div>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700 dark:text-slate-200" htmlFor="edition-notes">Observações<textarea className={marketingFormTextareaClass} id="edition-notes" maxLength={10000} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} value={draft.notes} /></label>
        </form>
      ) : null}
      {!canEdit && !query.isLoading && !query.isError && editions.length === 0 ? <div className="mt-4 text-center text-gray-500 dark:text-slate-400"><CalendarDays aria-hidden="true" className="mx-auto h-5 w-5" /></div> : null}
    </Dialog>
  );
}
