import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { useClient } from "@modules/clients/hooks/useClients";
import { useIntegracaoTasksList } from "@modules/integracao/hooks/useIntegracaoTasks";
import { formatBrlAmount } from "@shared/utils/inputFormatting";

import { useCommercialProposalConfigs } from "../hooks/useCommercialProposalConfigs";
import {
  calculateProposalDiscountedTotal,
  calculateProposalRecurringAmount,
  calculateProposalSingleTotal,
} from "../proposalCalculations.mjs";

type Template = "padrao" | "detalhada" | "informativa";
type ProposalItem = {
  id: string;
  sourceTaskId: string | null;
  description: string;
  quantity: string;
  percentage: string;
  unitPrice: string;
  amount: string;
  included: boolean;
};

const templates: Array<{ value: Template; label: string }> = [
  { value: "padrao", label: "Proposta padrão" },
  { value: "detalhada", label: "Proposta detalhada" },
  { value: "informativa", label: "Proposta informativa" },
];

function parseDecimal(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function amountInCents(value: string): number | null {
  const amount = parseDecimal(value);
  return amount === null ? null : Math.round(amount * 100);
}

function formatCurrency(valueInCents: number | null): string {
  return valueInCents === null ? "A calcular" : formatBrlAmount(valueInCents / 100);
}

function formatProposalDate(value: string): string {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function makeItem(id: string, description = "", sourceTaskId: string | null = null): ProposalItem {
  return { id, sourceTaskId, description, quantity: "1", percentage: "0", unitPrice: "0", amount: "0", included: true };
}

export function CommercialProposal({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { access, isLoading: accessLoading } = useModuleAccess("comercial");
  const clientQuery = useClient(clientId);
  const configQuery = useCommercialProposalConfigs();
  const taskQuery = useIntegracaoTasksList({ clientId, status: "Todos", page: 1, limit: 100 });
  const initialized = useRef(false);
  const [template, setTemplate] = useState<Template>("padrao");
  const [preview, setPreview] = useState(false);
  const [referenceSalary, setReferenceSalary] = useState("");
  const [validity, setValidity] = useState("10");
  const [payment, setPayment] = useState("BOLETO");
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().slice(0, 10);
  });
  const [discount, setDiscount] = useState("0");
  const [discountUnit, setDiscountUnit] = useState<"UNSPECIFIED" | "BRL" | "PERCENT">("UNSPECIFIED");
  const [recurringItems, setRecurringItems] = useState<ProposalItem[]>([]);
  const [singleItems, setSingleItems] = useState<ProposalItem[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!accessLoading && !access.canEdit) setPreview(true);
  }, [accessLoading, access.canEdit]);

  const client = clientQuery.data;
  const integrationServices = useMemo(
    () => (taskQuery.data?.data ?? []).filter((task) => task.charge_comercial),
    [taskQuery.data],
  );

  useEffect(() => {
    if (initialized.current || !client || configQuery.isLoading || taskQuery.isLoading) return;
    initialized.current = true;
    setReferenceSalary(String(configQuery.data?.[0]?.contract_value ?? "0"));
    setRecurringItems([
      makeItem("recurring-1", `Assessoria Mensal${client.regime ? ` - ${client.regime}` : ""}`),
    ]);
    setSingleItems(
      integrationServices.map((task) => makeItem(`task-${task.id}`, task.name, task.id)),
    );
  }, [client, configQuery.data, configQuery.isLoading, integrationServices, taskQuery.isLoading]);

  const recurringTotal = recurringItems.reduce((total, item) => {
    const amount = amountInCents(item.amount);
    return total + (item.included && amount !== null ? amount : 0);
  }, 0);
  const singleTotal = singleItems.reduce((total, item) => {
    const amount = amountInCents(item.amount);
    return total + (item.included && amount !== null ? amount : 0);
  }, 0);
  const discountedSingleTotal = calculateProposalDiscountedTotal(
    singleTotal,
    discountUnit === "BRL" ? (amountInCents(discount) ?? 0) : (parseDecimal(discount) ?? 0),
    discountUnit,
  );
  const readOnly = preview || !access.canEdit;

  function updateItem(
    setter: typeof setRecurringItems,
    itemId: string,
    field: keyof ProposalItem,
    value: string | boolean,
  ) {
    setter((items) => items.map((item) => {
      if (item.id !== itemId) return item;
      const next = { ...item, [field]: value };
      if (field === "percentage" || field === "unitPrice" || field === "quantity") {
        if (setter === setRecurringItems && field === "percentage") {
          const result = calculateProposalRecurringAmount(
            Math.round((Number(referenceSalary.replace(",", ".")) || 0) * 100),
            Number(String(value).replace(",", ".")) || 0,
          );
          next.amount = result === null ? "" : (result / 100).toFixed(2);
        } else if (setter === setRecurringItems && field === "unitPrice") {
          next.amount = String(value);
        } else if (setter === setSingleItems) {
          const qty = parseDecimal(String(field === "quantity" ? value : next.quantity));
          const price = amountInCents(String(field === "unitPrice" ? value : next.unitPrice));
          const result = qty === null || price === null ? null : calculateProposalSingleTotal(qty, price);
          next.amount = result === null ? "" : (result / 100).toFixed(2);
        }
      }
      return next;
    }));
  }

  function updateReferenceSalary(value: string) {
    setReferenceSalary(value);
    const salary = Math.round((Number(value.replace(",", ".")) || 0) * 100);
    setRecurringItems((items) => items.map((item) => {
      const percentage = Number(item.percentage.replace(",", ".")) || 0;
      const amount = calculateProposalRecurringAmount(salary, percentage);
      return { ...item, amount: amount === null ? "" : (amount / 100).toFixed(2) };
    }));
  }

  function printProposal() {
    if (!preview) setPreview(true);
    window.setTimeout(() => window.print(), 0);
  }

  if (accessLoading || clientQuery.isLoading || configQuery.isLoading || taskQuery.isLoading) {
    return <div className="mx-auto max-w-5xl p-6 text-sm text-slate-500">Carregando dados da proposta...</div>;
  }
  if (!access.canView) {
    return <section className="mx-auto max-w-5xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">Você não tem acesso ao módulo Comercial.</section>;
  }
  if (!client || clientQuery.isError) {
    return <section className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200" role="alert">Não foi possível carregar o cliente para a proposta.</section>;
  }

  const documentTitle = {
    padrao: "ORÇAMENTO — PRESTAÇÃO DE SERVIÇOS CONTÁBEIS",
    detalhada: "ORÇAMENTO DETALHADO — SERVIÇOS CONTÁBEIS",
    informativa: "PROPOSTA DE SERVIÇOS CONTÁBEIS",
  }[template];
  const documentDescription = {
    padrao: "Serviços recorrentes e únicos para conferência do contratante.",
    detalhada: "Composição dos valores por quantidade, percentual e unidade.",
    informativa: "Escopo comercial, condições e valores para avaliação.",
  }[template];
  const itemFieldClass = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:text-white";

  return (
    <main className="commercial-proposal mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-testid="commercial-proposal">
      <header className="hide-on-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={() => void router.push("/comercial")} className="mb-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar ao Comercial</button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Preparar proposta</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Revise e edite os dados antes de gerar a prévia. A proposta não é salva.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.canEdit ? <button type="button" onClick={() => setPreview((value) => !value)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">{preview ? "Editar valores" : "Prévia"}</button> : null}
          <button type="button" onClick={printProposal} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"><Printer className="h-4 w-4" aria-hidden="true" />Imprimir / Salvar em PDF</button>
        </div>
      </header>

      {!preview ? <section className="hide-on-print grid gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-3" aria-label="Configuração da proposta">
        <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Modelo<select className={`${itemFieldClass} mt-1`} value={template} onChange={(event) => setTemplate(event.target.value as Template)}>{templates.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Salário de referência (R$)<input className={`${itemFieldClass} mt-1`} inputMode="decimal" value={referenceSalary} onChange={(event) => updateReferenceSalary(event.target.value)} disabled={readOnly} /></label>
        <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Validade (dias)<input className={`${itemFieldClass} mt-1`} inputMode="numeric" value={validity} onChange={(event) => setValidity(event.target.value)} disabled={readOnly} /></label>
      </section> : null}

      {taskQuery.isError ? <p className="hide-on-print rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200" role="alert">Não foi possível carregar os serviços da Integração. Você pode preencher as linhas manualmente.</p> : null}
      {!integrationServices.length && !taskQuery.isError ? <p className="hide-on-print rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Nenhuma tarefa comercial elegível veio da Integração. Adicione as linhas necessárias manualmente.</p> : null}

      <article className="commercial-proposal-print rounded-xl border border-slate-200 bg-white p-5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:p-8" aria-label="Documento de proposta">
        <div className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-5 dark:border-slate-700">
          <div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{documentTitle}</p>
            <h2 className="mt-1 text-2xl font-bold">Prestação de serviços contábeis</h2>
            <p className="mt-1 max-w-[65ch] text-sm text-slate-600 dark:text-slate-300">{documentDescription}</p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Data: {new Intl.DateTimeFormat("pt-BR").format(new Date())}</p>
          </div>
          <div className="min-w-56 text-sm leading-6">
            <p><strong>Cliente:</strong> {client.company_name || client.name}</p>
            {client.fantasy_name ? <p><strong>Nome fantasia:</strong> {client.fantasy_name}</p> : null}
            <p><strong>CPF/CNPJ:</strong> {client.cpf_cnpj || "Não informado"}</p>
            {client.email ? <p><strong>E-mail:</strong> {client.email}</p> : null}
          </div>
        </div>

        <section className="mt-6" aria-labelledby="proposal-recurring-title">
          <div className="flex items-center justify-between gap-3"><h3 id="proposal-recurring-title" className="text-lg font-semibold">Serviços recorrentes</h3>{!readOnly ? <button type="button" onClick={() => setRecurringItems((items) => [...items, makeItem(`recurring-${Date.now()}`)])} className="hide-on-print inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600"><Plus className="h-4 w-4" aria-hidden="true" />Adicionar</button> : null}</div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2 pr-3">Serviço</th><th className="px-2 py-2">Qtd.</th><th className="px-2 py-2">% faturamento</th><th className="px-2 py-2">Valor mensal</th><th className={preview ? "hidden" : "hide-on-print px-2 py-2"}>Incluir</th><th className={preview ? "hidden" : "hide-on-print px-2 py-2"} /></tr></thead><tbody>{recurringItems.map((item, index) => <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800"><td className="py-2 pr-3">{preview ? item.description : <input aria-label={`Descrição do serviço recorrente ${index + 1}`} className={itemFieldClass} value={item.description} onChange={(event) => updateItem(setRecurringItems, item.id, "description", event.target.value)} />}</td><td className="px-2 py-2">{preview ? item.quantity : <input aria-label={`Quantidade do serviço recorrente ${index + 1}`} className={itemFieldClass} value={item.quantity} onChange={(event) => updateItem(setRecurringItems, item.id, "quantity", event.target.value)} />}</td><td className="px-2 py-2">{preview ? `${item.percentage}%` : <input aria-label={`Percentual do serviço recorrente ${index + 1}`} className={itemFieldClass} inputMode="decimal" value={item.percentage} onChange={(event) => updateItem(setRecurringItems, item.id, "percentage", event.target.value)} />}</td><td className="px-2 py-2">{preview ? formatCurrency(amountInCents(item.amount)) : <input aria-label={`Valor mensal do serviço recorrente ${index + 1}`} className={itemFieldClass} inputMode="decimal" value={item.amount} onChange={(event) => updateItem(setRecurringItems, item.id, "amount", event.target.value)} />}</td><td className={preview ? "hidden" : "hide-on-print px-2 py-2"}><input aria-label={`Incluir serviço recorrente ${index + 1}`} type="checkbox" checked={item.included} disabled={readOnly} onChange={(event) => updateItem(setRecurringItems, item.id, "included", event.target.checked)} /></td><td className={preview ? "hidden" : "hide-on-print px-2 py-2"}>{!preview && recurringItems.length > 1 ? <button type="button" aria-label={`Remover serviço recorrente ${index + 1}`} onClick={() => setRecurringItems((items) => items.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-right text-sm font-semibold">Total mensal: {formatCurrency(recurringTotal)}</p>
        </section>

        <section className="mt-7" aria-labelledby="proposal-single-title">
          <div className="flex items-center justify-between gap-3"><h3 id="proposal-single-title" className="text-lg font-semibold">Serviços únicos</h3>{!readOnly ? <button type="button" onClick={() => setSingleItems((items) => [...items, makeItem(`single-${Date.now()}`)])} className="hide-on-print inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600"><Plus className="h-4 w-4" aria-hidden="true" />Adicionar</button> : null}</div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2 pr-3">Serviço</th><th className="px-2 py-2">Qtd.</th><th className="px-2 py-2">Valor unitário</th><th className="px-2 py-2">Total</th><th className={preview ? "hidden" : "hide-on-print px-2 py-2"}>Incluir</th><th className={preview ? "hidden" : "hide-on-print px-2 py-2"} /></tr></thead><tbody>{singleItems.map((item, index) => <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800"><td className="py-2 pr-3">{preview ? item.description : <div className="space-y-1"><input aria-label={`Descrição do serviço único ${index + 1}`} className={itemFieldClass} value={item.description} onChange={(event) => updateItem(setSingleItems, item.id, "description", event.target.value)} />{item.sourceTaskId ? <span className="text-xs text-slate-500">Origem: Integração</span> : null}</div>}</td><td className="px-2 py-2">{preview ? item.quantity : <input aria-label={`Quantidade do serviço único ${index + 1}`} className={itemFieldClass} inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(setSingleItems, item.id, "quantity", event.target.value)} />}</td><td className="px-2 py-2">{preview ? formatCurrency(amountInCents(item.unitPrice)) : <input aria-label={`Valor unitário do serviço único ${index + 1}`} className={itemFieldClass} inputMode="decimal" value={item.unitPrice} onChange={(event) => updateItem(setSingleItems, item.id, "unitPrice", event.target.value)} />}</td><td className="px-2 py-2">{preview ? formatCurrency(amountInCents(item.amount)) : <input aria-label={`Valor total do serviço único ${index + 1}`} className={itemFieldClass} inputMode="decimal" value={item.amount} onChange={(event) => updateItem(setSingleItems, item.id, "amount", event.target.value)} />}</td><td className={preview ? "hidden" : "hide-on-print px-2 py-2"}><input aria-label={`Incluir serviço único ${index + 1}`} type="checkbox" checked={item.included} disabled={readOnly} onChange={(event) => updateItem(setSingleItems, item.id, "included", event.target.checked)} /></td><td className={preview ? "hidden" : "hide-on-print px-2 py-2"}>{!readOnly ? <button type="button" aria-label={`Remover serviço único ${index + 1}`} onClick={() => setSingleItems((items) => items.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}</td></tr>)}</tbody></table></div>
          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:grid-cols-2">
            <p className="text-sm font-semibold">Total dos serviços únicos: {formatCurrency(singleTotal)}</p>
            <p className="text-sm font-semibold">Total com desconto: {discountedSingleTotal === null ? "Informe a unidade do desconto para calcular" : formatCurrency(discountedSingleTotal)}</p>
            {preview ? <p className="text-sm">Desconto: {discount} {discountUnit === "BRL" ? "R$" : discountUnit === "PERCENT" ? "%" : "(unidade não especificada)"}</p> : null}
            {!preview ? <label className="hide-on-print text-sm font-medium">Desconto<input aria-label="Desconto" className={`${itemFieldClass} mt-1`} inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} disabled={readOnly} /></label> : null}
            {!preview ? <label className="hide-on-print text-sm font-medium">Unidade do desconto<select aria-label="Unidade do desconto" className={`${itemFieldClass} mt-1`} value={discountUnit} onChange={(event) => setDiscountUnit(event.target.value as typeof discountUnit)} disabled={readOnly}><option value="UNSPECIFIED">Não especificada</option><option value="BRL">Valor em reais</option><option value="PERCENT">Percentual</option></select></label> : null}
            <p className="text-sm">Forma de pagamento: {preview ? payment : <select aria-label="Forma de pagamento" className={`${itemFieldClass} mt-1`} value={payment} onChange={(event) => setPayment(event.target.value)}><option>BOLETO</option><option>CARTÃO DE CRÉDITO</option><option>PIX</option><option>Outro</option></select>}</p>
            <label className="text-sm">Primeiro vencimento: {preview ? formatProposalDate(firstDueDate) : <input aria-label="Primeiro vencimento" type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} className={`${itemFieldClass} mt-1`} disabled={readOnly} />}</label>
          </div>
        </section>

        <section className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="font-semibold">Observações</h3>{preview ? <p className="mt-2 min-h-8 whitespace-pre-wrap text-sm">{notes || "—"}</p> : <textarea aria-label="Observações" className={`${itemFieldClass} mt-2 min-h-24 py-2`} value={notes} onChange={(event) => setNotes(event.target.value)} />}{preview ? <p className="mt-3 text-sm">Validade: {validity || "—"} dias a partir da emissão.</p> : null}</section>
        <footer className="mt-12 grid gap-8 sm:grid-cols-2"><p className="border-t border-slate-400 pt-2 text-center text-sm">Aceite do contratante</p><p className="border-t border-slate-400 pt-2 text-center text-sm">Aceite do contratado</p></footer>
      </article>
      {!readOnly ? <p className="hide-on-print text-xs text-slate-500">Ao imprimir, escolha “Salvar como PDF” para exportar uma cópia. O documento permanece apenas nesta sessão.</p> : null}
    </main>
  );
}
