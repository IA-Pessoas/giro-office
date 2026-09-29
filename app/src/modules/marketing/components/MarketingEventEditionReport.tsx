import type { ReactNode } from "react";

import type { MarketingEditionLists, MarketingEventEditionReport as EditionReport } from "../types/marketingEventEdition";

function formatAmount(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  return `R$ ${new Intl.NumberFormat("pt-BR").format(BigInt(whole))},${fraction.padEnd(2, "0")}`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${date.slice(0, 10)}T00:00:00.000Z`),
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ValueList({ items }: { items: string[] }) {
  return items.length > 0 ? (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
    </ul>
  ) : <p className="text-gray-500 dark:text-slate-400">Sem itens informados.</p>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-slate-100">{children || "—"}</dd>
    </div>
  );
}

function PlanningSection({ title, values }: { title: string; values: MarketingEditionLists }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-gray-200 pb-2 font-semibold text-gray-900 dark:border-slate-700 dark:text-white">
        {title}
      </h3>
      <dl className="grid gap-4 sm:grid-cols-2">
        {Object.entries(values).map(([name, items]) => (
          <div key={name}>
            <dt className="mb-1 text-sm font-medium capitalize text-gray-700 dark:text-slate-200">
              {name.replaceAll("_", " ")}
            </dt>
            <dd className="text-sm text-gray-700 dark:text-slate-200">
              <ValueList items={items} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function printReport() {
  const report = document.getElementById("marketing-event-edition-report");
  for (let element = report; element; element = element.parentElement) element.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  window.print();
}

export function MarketingEventEditionReport({
  report,
  onBack,
}: {
  report: EditionReport;
  onBack: () => void;
}) {
  const { event, edition } = report;
  return (
    <article
      aria-label={`Relatório da edição ${edition.name}`}
      className="marketing-event-edition-report space-y-6 text-gray-900 dark:text-slate-100"
      id="marketing-event-edition-report"
    >
      <div className="hide-on-print flex flex-wrap justify-between gap-2">
        <button
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={onBack}
          type="button"
        >
          Voltar às edições
        </button>
        <button
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          onClick={printReport}
          type="button"
        >
          Imprimir relatório
        </button>
      </div>

      <header className="space-y-1 border-b border-gray-200 pb-4 dark:border-slate-700">
        <p className="text-sm text-gray-600 dark:text-slate-300">Relatório da edição</p>
        <h2 className="text-xl font-semibold">{edition.name}</h2>
        <p className="text-sm text-gray-700 dark:text-slate-200">
          {event.name} · {formatDate(edition.date)} · {edition.place}
        </p>
      </header>

      <section aria-label="Dados do evento e da edição">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Objetivo">{event.objective}</Detail>
          <Detail label="Público">{event.audience}</Detail>
          <Detail label="Status do evento">{event.status}</Detail>
          <Detail label="Prioridade">{event.priority}</Detail>
          <Detail label="Parcerias">{edition.partnerships.join(", ")}</Detail>
          <Detail label="Equipe organizadora">{edition.organizingTeam.join(", ")}</Detail>
          <Detail label="Observações">{edition.notes}</Detail>
        </dl>
      </section>

      <section className="space-y-3">
        <h3 className="border-b border-gray-200 pb-2 font-semibold dark:border-slate-700">Orçamento</h3>
        {edition.budgetItems.length ? (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {edition.budgetItems.map((item) => (
                <tr className="border-b border-gray-100 last:border-0 dark:border-slate-800" key={item.id}>
                  <td className="py-2 pr-3">{item.name}</td>
                  <td className="py-2 text-right tabular-nums">{formatAmount(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="pt-3 text-left">Total</th>
                <td className="pt-3 text-right font-semibold tabular-nums">{formatAmount(edition.budgetTotal)}</td>
              </tr>
            </tfoot>
          </table>
        ) : <p className="text-sm text-gray-500 dark:text-slate-400">Nenhum item de orçamento.</p>}
      </section>

      <div className="space-y-6">
        <PlanningSection title="Logística" values={edition.logistics} />
        <PlanningSection title="Antes do evento · marketing e comunicação" values={edition.marketingCommunication} />
        <PlanningSection title="Durante o evento" values={edition.duringEvent} />
        <PlanningSection title="Após o evento" values={edition.afterEvent} />
      </div>

      <section className="space-y-2">
        <h3 className="border-b border-gray-200 pb-2 font-semibold dark:border-slate-700">Período de avaliação</h3>
        {edition.feedbackPeriodStart && edition.feedbackPeriodEnd ? (
          <p className="text-sm">
            {formatDateTime(edition.feedbackPeriodStart)} – {formatDateTime(edition.feedbackPeriodEnd)}
          </p>
        ) : <p className="text-sm text-gray-500 dark:text-slate-400">Período não configurado.</p>}
      </section>

      <section className="space-y-2">
        <h3 className="border-b border-gray-200 pb-2 font-semibold dark:border-slate-700">Avaliação</h3>
        {edition.feedback ? (
          <div className="space-y-1 text-sm">
            <p><strong>Nota:</strong> {edition.feedback.rating}/5</p>
            <p><strong>Observação:</strong> {edition.feedback.observation || "Sem observação."}</p>
            <p className="text-gray-500 dark:text-slate-400">Registrada em {formatDateTime(edition.feedback.evaluatedAt)}</p>
          </div>
        ) : <p className="text-sm text-gray-500 dark:text-slate-400">Nenhuma avaliação registrada.</p>}
      </section>
    </article>
  );
}
