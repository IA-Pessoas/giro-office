import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
import { useQueries } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { useClient } from "@modules/clients/hooks/useClients";
import {
  integracaoTasksListQueryKey,
  useIntegracaoTasksList,
} from "@modules/integracao/hooks";
import { integracaoTasksService } from "@modules/integracao/services";
import { formatBrlAmount } from "@shared/utils/inputFormatting";
import { Input } from "@shared/ui/newLayout/input";
import { cn } from "@shared/ui/newLayout/utils";

import { useCommercialProposalConfigs } from "../hooks/useCommercialProposalConfigs";
import {
  calculateProposalDiscountedTotal,
  calculateProposalRecurringAmount,
  calculateProposalSingleTotal,
} from "../proposalCalculations.mjs";

type Template = "padrao" | "preco-direto" | "campos-livres";
type ProposalItem = {
  id: string;
  sourceTaskId: string | null;
  description: string;
  descriptionIsCustom: boolean;
  quantity: string;
  percentage: string;
  unitPrice: string;
  amount: string;
  included: boolean;
};

type FreeField = { label: string; value: string };

function ProposalInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(
        "min-h-10 rounded-lg border-slate-300 bg-white text-sm text-slate-900",
        "focus-visible:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500",
        "dark:border-slate-600 dark:bg-slate-950 dark:text-white",
        className,
      )}
    />
  );
}

function ProposalSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900",
        "focus:outline-none focus:ring-2 focus:ring-blue-500",
        "dark:border-slate-600 dark:bg-slate-950 dark:text-white",
        className,
      )}
    />
  );
}

const templates: Array<{ value: Template; label: string }> = [
  { value: "padrao", label: "Proposta padrão" },
  { value: "preco-direto", label: "Preço direto" },
  { value: "campos-livres", label: "Campos livres" },
];

const recurringDescriptionOptions = [
  "Assessoria Mensal - Simples Nacional",
  "Assessoria Mensal - Lucro Presumido",
  "Assessoria Mensal - Lucro Real",
  "Assessoria Mensal",
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
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function makeItem(id: string, description = "", sourceTaskId: string | null = null): ProposalItem {
  return {
    id,
    sourceTaskId,
    description,
    descriptionIsCustom: !recurringDescriptionOptions.includes(description) && description !== "",
    quantity: "1",
    percentage: "0",
    unitPrice: "0",
    amount: "0",
    included: true,
  };
}

export function CommercialProposal({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { access, isLoading: accessLoading } = useModuleAccess("comercial");
  const clientQuery = useClient(clientId);
  const configQuery = useCommercialProposalConfigs();
  const taskListParams = { clientId, status: "Todos", limit: 100 } as const;
  const taskQuery = useIntegracaoTasksList({ ...taskListParams, page: 1 });
  const taskPageCount = Math.max(1, Math.ceil((taskQuery.data?.total ?? 0) / taskListParams.limit));
  const additionalTaskQueries = useQueries({
    queries: Array.from({ length: taskPageCount - 1 }, (_, index) => {
      const params = { ...taskListParams, page: index + 2 };
      return {
        queryKey: integracaoTasksListQueryKey(params),
        queryFn: () => integracaoTasksService.list(params),
      };
    }),
  });
  const allTasksLoading = taskQuery.isLoading
    || additionalTaskQueries.some((query) => query.isLoading);
  const allTasksError = taskQuery.isError || additionalTaskQueries.some((query) => query.isError);
  const integrationTasks = [taskQuery.data, ...additionalTaskQueries.map((query) => query.data)]
    .flatMap((page) => page?.data ?? []);
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
  const [discountUnit, setDiscountUnit] = useState<
    "UNSPECIFIED" | "BRL" | "PERCENT"
  >("UNSPECIFIED");
  const [recurringItems, setRecurringItems] = useState<ProposalItem[]>([]);
  const [singleItems, setSingleItems] = useState<ProposalItem[]>([]);
  const [notes, setNotes] = useState("");
  const [freeFields, setFreeFields] = useState<FreeField[]>(
    Array.from({ length: 5 }, (_, index) => ({ label: "", value: "" })),
  );

  useEffect(() => {
    if (!accessLoading && !access.canEdit) setPreview(true);
  }, [accessLoading, access.canEdit]);

  const client = clientQuery.data;
  const integrationServices = integrationTasks.filter((task) => task.charge_comercial);

  useEffect(() => {
    if (
      initialized.current
      || !client
      || configQuery.isLoading
      || allTasksLoading
      || allTasksError
    ) return;
    initialized.current = true;
    setReferenceSalary(String(configQuery.data?.[0]?.contract_value ?? "0"));
    setRecurringItems([
      makeItem("recurring-1", `Assessoria Mensal${client.regime ? ` - ${client.regime}` : ""}`),
    ]);
    setSingleItems(
      integrationServices.map((task) => makeItem(`task-${task.id}`, task.name, task.id)),
    );
  }, [
    allTasksError,
    allTasksLoading,
    client,
    configQuery.data,
    configQuery.isLoading,
    integrationServices,
  ]);

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
        if (setter === setRecurringItems && field === "percentage" && template !== "preco-direto") {
          const result = calculateProposalRecurringAmount(
            Math.round((Number(referenceSalary.replace(",", ".")) || 0) * 100),
            Number(String(value).replace(",", ".")) || 0,
          );
          next.amount = result === null ? "" : (result / 100).toFixed(2);
        } else if (
          setter === setRecurringItems
          && template === "preco-direto"
          && field !== "percentage"
        ) {
          const quantity = parseDecimal(next.quantity);
          const unitPrice = amountInCents(next.unitPrice);
          const result = quantity === null || unitPrice === null
            ? null
            : calculateProposalSingleTotal(quantity, unitPrice);
          next.amount = result === null ? "" : (result / 100).toFixed(2);
        } else if (setter === setRecurringItems && field === "unitPrice") {
          next.amount = String(value);
        } else if (setter === setSingleItems) {
          const qty = parseDecimal(String(field === "quantity" ? value : next.quantity));
          const price = amountInCents(String(field === "unitPrice" ? value : next.unitPrice));
          const result = qty === null || price === null
            ? null
            : calculateProposalSingleTotal(qty, price);
          next.amount = result === null ? "" : (result / 100).toFixed(2);
        }
      }
      return next;
    }));
  }

  function updateItemFromInput(
    setter: typeof setRecurringItems,
    itemId: string,
    field: keyof ProposalItem,
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.type === "checkbox"
        ? event.currentTarget.checked
        : event.currentTarget.value;
      updateItem(setter, itemId, field, value);
    };
  }

  function removeItem(setter: typeof setRecurringItems, itemId: string) {
    setter((items) => items.filter((item) => item.id !== itemId));
  }

  function updateReferenceSalary(value: string) {
    setReferenceSalary(value);
    const salary = Math.round((Number(value.replace(",", ".")) || 0) * 100);
    setRecurringItems((items) => items.map((item) => {
      const percentage = Number(item.percentage.replace(",", ".")) || 0;
      if (template === "preco-direto") return item;
      const amount = calculateProposalRecurringAmount(salary, percentage);
      return { ...item, amount: amount === null ? "" : (amount / 100).toFixed(2) };
    }));
  }

  function updateTemplate(value: Template) {
    setTemplate(value);
  }

  function printProposal() {
    if (!preview) setPreview(true);
    window.setTimeout(() => window.print(), 0);
  }

  if (accessLoading || clientQuery.isLoading || configQuery.isLoading || allTasksLoading) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-sm text-slate-500">
        Carregando dados da proposta...
      </div>
    );
  }
  if (!access.canView) {
    return (
      <section className={cn(
        "mx-auto max-w-5xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900",
        "dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100",
      )}>
        Você não tem acesso ao módulo Comercial.
      </section>
    );
  }
  if (!client || clientQuery.isError) {
    return (
      <section
        className={cn(
          "mx-auto max-w-5xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-800",
          "dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200",
        )}
        role="alert"
      >
        Não foi possível carregar o cliente para a proposta.
      </section>
    );
  }

  const documentTitle = {
    padrao: "ORÇAMENTO — PRESTAÇÃO DE SERVIÇOS CONTÁBEIS",
    "preco-direto": "PROPOSTA DE PREÇO DIRETO — SERVIÇOS CONTÁBEIS",
    "campos-livres": "PROPOSTA COM CAMPOS LIVRES — SERVIÇOS CONTÁBEIS",
  }[template];
  const documentDescription = {
    padrao: "Serviços recorrentes e únicos para conferência do contratante.",
    "preco-direto": "Itens de serviço com quantidade, preço unitário e total editável.",
    "campos-livres": "Campos complementares e condições para preenchimento livre.",
  }[template];
  function updateFreeField(index: number, key: keyof FreeField, value: string) {
    setFreeFields((fields) => fields.map((field, fieldIndex) =>
      fieldIndex === index ? { ...field, [key]: value } : field,
    ));
  }

  return (
    <main
      className="commercial-proposal mx-auto max-w-6xl space-y-5 p-4 sm:p-6"
      data-testid="commercial-proposal"
    >
      <header className="hide-on-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => void router.push("/comercial")}
            className={cn(
              "mb-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium",
              "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
            )}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar ao Comercial
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Preparar proposta</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Revise e edite os dados antes de gerar a prévia. A proposta não é salva.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.canEdit ? <button
            type="button"
            onClick={() => setPreview((value) => !value)}
            className={cn(
              "min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold",
              "text-slate-700 hover:bg-slate-50 dark:border-slate-600",
              "dark:text-slate-200 dark:hover:bg-slate-800",
            )}
          >
            {preview ? "Editar valores" : "Prévia"}
          </button> : null}
          <button
            type="button"
            onClick={printProposal}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4",
              "text-sm font-semibold text-white hover:bg-blue-700",
            )}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />Imprimir / Salvar em PDF
          </button>
        </div>
      </header>

      {!preview ? <section
        className={cn(
          "hide-on-print grid gap-4 rounded-xl border border-slate-200 bg-white p-4",
          "dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-3",
        )}
        aria-label="Configuração da proposta"
      >
        <label className="text-sm font-medium text-slate-800 dark:text-slate-100">
          Modelo
          <ProposalSelect
            className="mt-1"
            value={template}
            onChange={(event) => updateTemplate(event.target.value as Template)}
          >
            {templates.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </ProposalSelect>
        </label>
        <label className="text-sm font-medium text-slate-800 dark:text-slate-100">
          Salário de referência (R$)
          <ProposalInput
            className="mt-1"
            inputMode="decimal"
            value={referenceSalary}
            onChange={(event) => updateReferenceSalary(event.target.value)}
            disabled={readOnly}
          />
        </label>
        <label className="text-sm font-medium text-slate-800 dark:text-slate-100">
          Validade (dias)
          <ProposalInput
            className="mt-1"
            inputMode="numeric"
            value={validity}
            onChange={(event) => setValidity(event.target.value)}
            disabled={readOnly}
          />
        </label>
      </section> : null}

      {allTasksError ? <p
        className={cn(
          "hide-on-print rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900",
          "dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200",
        )}
        role="alert"
      >
        Não foi possível carregar todos os serviços da Integração. As linhas não foram
        inicializadas para evitar uma proposta incompleta; você pode adicioná-las manualmente.
      </p> : null}
      {!integrationServices.length && !allTasksError ? <p
        className={cn(
          "hide-on-print rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
        )}
      >
        Nenhuma tarefa comercial elegível veio da Integração. Adicione as linhas necessárias
        manualmente.
      </p> : null}

      <article
        className={cn(
          "commercial-proposal-print rounded-xl border border-slate-200 bg-white p-5",
          "text-slate-900",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:p-8",
        )}
        aria-label="Documento de proposta"
      >
        <div className={cn(
          "flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-5",
          "dark:border-slate-700",
        )}>
          <div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {documentTitle}
            </p>
            <h2 className="mt-1 text-2xl font-bold">Prestação de serviços contábeis</h2>
            <p className="mt-1 max-w-[65ch] text-sm text-slate-600 dark:text-slate-300">
              {documentDescription}
            </p>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Data: {new Intl.DateTimeFormat("pt-BR").format(new Date())}
            </p>
          </div>
          <div className="min-w-56 text-sm leading-6">
            <p><strong>Cliente:</strong> {client.company_name || client.name}</p>
            {client.fantasy_name ? <p>
              <strong>Nome fantasia:</strong> {client.fantasy_name}
            </p> : null}
            <p><strong>CPF/CNPJ:</strong> {client.cpf_cnpj || "Não informado"}</p>
            {client.email ? <p><strong>E-mail:</strong> {client.email}</p> : null}
          </div>
        </div>

        <section className="mt-6" aria-labelledby="proposal-recurring-title">
          <div className="flex items-center justify-between gap-3">
            <h3 id="proposal-recurring-title" className="text-lg font-semibold">
              Serviços recorrentes
            </h3>
            {!readOnly ? <button
              type="button"
              onClick={() => setRecurringItems((items) => [
                ...items,
                makeItem(`recurring-${Date.now()}`),
              ])}
              className={cn(
                "hide-on-print inline-flex min-h-9 items-center gap-1 rounded-lg border",
                "border-slate-300 px-3 text-sm font-semibold dark:border-slate-600",
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />Adicionar
            </button> : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-3">Serviço</th>
                  <th className="px-2 py-2">Qtd.</th>
                  <th className="px-2 py-2">% faturamento</th>
                  {template === "preco-direto" ? <th className="px-2 py-2">Valor unitário</th> : null}
                  <th className="px-2 py-2">Valor mensal</th>
                  <th className={preview ? "hidden" : "hide-on-print px-2 py-2"}>Incluir</th>
                  <th className={preview ? "hidden" : "hide-on-print px-2 py-2"} />
                </tr>
              </thead>
              <tbody>
                {recurringItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3">
                      {preview ? item.description : <div className="space-y-2">
                        <ProposalSelect
                          aria-label={`Categoria do serviço recorrente ${index + 1}`}
                          value={item.descriptionIsCustom ? "CUSTOM" : item.description}
                          onChange={(event) => {
                            const value = event.target.value;
                            setRecurringItems((items) => items.map((current) => (
                              current.id === item.id
                                ? {
                                    ...current,
                                    descriptionIsCustom: value === "CUSTOM",
                                    ...(value === "CUSTOM" ? {} : { description: value }),
                                  }
                                : current
                            )));
                          }}
                        >
                          {recurringDescriptionOptions.map((description) => <option
                            key={description}
                            value={description}
                          >{description || "Sem descrição"}</option>)}
                          <option value="">Sem descrição</option>
                          <option value="CUSTOM">Personalizada</option>
                        </ProposalSelect>
                        {item.descriptionIsCustom ? <ProposalInput
                          aria-label={`Descrição personalizada do serviço recorrente ${index + 1}`}
                          value={item.description}
                          onChange={updateItemFromInput(setRecurringItems, item.id, "description")}
                        /> : null}
                      </div>}
                    </td>
                    <td className="px-2 py-2">
                      {preview ? item.quantity : <ProposalInput
                        aria-label={`Quantidade do serviço recorrente ${index + 1}`}
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={updateItemFromInput(setRecurringItems, item.id, "quantity")}
                      />}
                    </td>
                    <td className="px-2 py-2">
                      {preview ? `${item.percentage}%` : <ProposalInput
                        aria-label={`Percentual do serviço recorrente ${index + 1}`}
                        inputMode="decimal"
                        value={item.percentage}
                        onChange={updateItemFromInput(setRecurringItems, item.id, "percentage")}
                      />}
                    </td>
                    {template === "preco-direto" ? <td className="px-2 py-2">
                      {preview ? formatCurrency(amountInCents(item.unitPrice)) : <ProposalInput
                        aria-label={`Valor unitário recorrente ${index + 1}`}
                        inputMode="decimal"
                        value={item.unitPrice}
                        onChange={updateItemFromInput(setRecurringItems, item.id, "unitPrice")}
                      />}
                    </td> : null}
                    <td className="px-2 py-2">
                      {preview ? formatCurrency(amountInCents(item.amount)) : <ProposalInput
                        aria-label={`Valor mensal do serviço recorrente ${index + 1}`}
                        inputMode="decimal"
                        value={item.amount}
                        onChange={updateItemFromInput(setRecurringItems, item.id, "amount")}
                      />}
                    </td>
                    <td className={preview ? "hidden" : "hide-on-print px-2 py-2"}>
                      <input
                        aria-label={`Incluir serviço recorrente ${index + 1}`}
                        type="checkbox"
                        checked={item.included}
                        disabled={readOnly}
                        onChange={updateItemFromInput(setRecurringItems, item.id, "included")}
                      />
                    </td>
                    <td className={preview ? "hidden" : "hide-on-print px-2 py-2"}>
                      {!preview && recurringItems.length > 1 ? <button
                        type="button"
                        aria-label={`Remover serviço recorrente ${index + 1}`}
                        onClick={() => removeItem(setRecurringItems, item.id)}
                      ><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-right text-sm font-semibold">
            Total mensal: {formatCurrency(recurringTotal)}
          </p>
        </section>

        <section className="mt-7" aria-labelledby="proposal-single-title">
          <div className="flex items-center justify-between gap-3">
            <h3 id="proposal-single-title" className="text-lg font-semibold">
              Serviços únicos
            </h3>
            {!readOnly ? <button
              type="button"
              onClick={() => setSingleItems((items) => [
                ...items,
                makeItem(`single-${Date.now()}`),
              ])}
              className={cn(
                "hide-on-print inline-flex min-h-9 items-center gap-1 rounded-lg border",
                "border-slate-300 px-3 text-sm font-semibold dark:border-slate-600",
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />Adicionar
            </button> : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-3">Serviço</th>
                  <th className="px-2 py-2">Qtd.</th>
                  <th className="px-2 py-2">Valor unitário</th>
                  <th className="px-2 py-2">Total</th>
                  <th className={preview ? "hidden" : "hide-on-print px-2 py-2"}>Incluir</th>
                  <th className={preview ? "hidden" : "hide-on-print px-2 py-2"} />
                </tr>
              </thead>
              <tbody>
                {singleItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3">
                      {preview ? item.description : <div className="space-y-1">
                        <ProposalInput
                          aria-label={`Descrição do serviço único ${index + 1}`}
                          value={item.description}
                          onChange={updateItemFromInput(setSingleItems, item.id, "description")}
                        />
                        {item.sourceTaskId ? <span className="text-xs text-slate-500">
                          Origem: Integração
                        </span> : null}
                      </div>}
                    </td>
                    <td className="px-2 py-2">
                      {preview ? item.quantity : <ProposalInput
                        aria-label={`Quantidade do serviço único ${index + 1}`}
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={updateItemFromInput(setSingleItems, item.id, "quantity")}
                      />}
                    </td>
                    <td className="px-2 py-2">
                      {preview ? formatCurrency(amountInCents(item.unitPrice)) : <ProposalInput
                        aria-label={`Valor unitário do serviço único ${index + 1}`}
                        inputMode="decimal"
                        value={item.unitPrice}
                        onChange={updateItemFromInput(setSingleItems, item.id, "unitPrice")}
                      />}
                    </td>
                    <td className="px-2 py-2">
                      {preview ? formatCurrency(amountInCents(item.amount)) : <ProposalInput
                        aria-label={`Valor total do serviço único ${index + 1}`}
                        inputMode="decimal"
                        value={item.amount}
                        onChange={updateItemFromInput(setSingleItems, item.id, "amount")}
                      />}
                    </td>
                    <td className={preview ? "hidden" : "hide-on-print px-2 py-2"}>
                      <input
                        aria-label={`Incluir serviço único ${index + 1}`}
                        type="checkbox"
                        checked={item.included}
                        disabled={readOnly}
                        onChange={updateItemFromInput(setSingleItems, item.id, "included")}
                      />
                    </td>
                    <td className={preview ? "hidden" : "hide-on-print px-2 py-2"}>
                      {!readOnly ? <button
                        type="button"
                        aria-label={`Remover serviço único ${index + 1}`}
                        onClick={() => removeItem(setSingleItems, item.id)}
                      ><Trash2 className="h-4 w-4" aria-hidden="true" /></button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={cn(
            "mt-4 grid gap-3 border-t border-slate-200 pt-4",
            "dark:border-slate-700 sm:grid-cols-2",
          )}>
            <p className="text-sm font-semibold">
              Total dos serviços únicos: {formatCurrency(singleTotal)}
            </p>
            <p className="text-sm font-semibold">
              Total com desconto: {discountedSingleTotal === null
                ? "Informe a unidade do desconto para calcular"
                : formatCurrency(discountedSingleTotal)}
            </p>
            {preview ? <p className="text-sm">
              Desconto: {discount} {discountUnit === "BRL"
                ? "R$"
                : discountUnit === "PERCENT"
                  ? "%"
                  : "(unidade não especificada)"}
            </p> : null}
            {!preview ? <label className="hide-on-print text-sm font-medium">
              Desconto
              <ProposalInput
                aria-label="Desconto"
                className="mt-1"
                inputMode="decimal"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                disabled={readOnly}
              />
            </label> : null}
            {!preview ? <label className="hide-on-print text-sm font-medium">
              Unidade do desconto
              <ProposalSelect
                aria-label="Unidade do desconto"
                className="mt-1"
                value={discountUnit}
                onChange={(event) => setDiscountUnit(event.target.value as typeof discountUnit)}
                disabled={readOnly}
              >
                <option value="UNSPECIFIED">Não especificada</option>
                <option value="BRL">Valor em reais</option>
                <option value="PERCENT">Percentual</option>
              </ProposalSelect>
            </label> : null}
            <p className="text-sm">
              Forma de pagamento: {preview ? payment : <ProposalSelect
                aria-label="Forma de pagamento"
                className="mt-1"
                value={payment}
                onChange={(event) => setPayment(event.target.value)}
              >
                <option>BOLETO</option>
                <option>CARTÃO DE CRÉDITO</option>
                <option>PIX</option>
                <option>Outro</option>
              </ProposalSelect>}
            </p>
            <label className="text-sm">
              Primeiro vencimento: {preview ? formatProposalDate(firstDueDate) : <ProposalInput
                aria-label="Primeiro vencimento"
                type="date"
                value={firstDueDate}
                onChange={(event) => setFirstDueDate(event.target.value)}
                className="mt-1"
                disabled={readOnly}
              />}
            </label>
          </div>
        </section>

        {template === "campos-livres" ? <section
          className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700"
          aria-label="Campos livres"
        >
          <h3 className="font-semibold">Campos livres</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {freeFields.map((field, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-2">
                {preview ? <>
                  <p className="text-sm">{field.label || "—"}</p>
                  <p className="whitespace-pre-wrap text-sm">{field.value || "—"}</p>
                </> : <>
                  <ProposalInput
                    aria-label={`Rótulo do campo livre ${index + 1}`}
                    placeholder={`Rótulo ${index + 1}`}
                    value={field.label}
                    onChange={(event) => updateFreeField(index, "label", event.target.value)}
                  />
                  <ProposalInput
                    aria-label={`Campo livre ${index + 1}`}
                    placeholder={`Informação ${index + 1}`}
                    value={field.value}
                    onChange={(event) => updateFreeField(index, "value", event.target.value)}
                  />
                </>}
              </div>
            ))}
          </div>
        </section> : null}

        <section className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
          <h3 className="font-semibold">Observações</h3>
          {preview ? <p className="mt-2 min-h-8 whitespace-pre-wrap text-sm">
            {notes || "—"}
          </p> : <textarea
            aria-label="Observações"
            className={cn(
              "mt-2 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2",
              "text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500",
              "dark:border-slate-600 dark:bg-slate-950 dark:text-white",
            )}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />}
          {preview ? <p className="mt-3 text-sm">
            Validade: {validity || "—"} dias a partir da emissão.
          </p> : null}
        </section>
        <footer className="mt-12 grid gap-8 sm:grid-cols-2">
          <p className="border-t border-slate-400 pt-2 text-center text-sm">
            Aceite do contratante
          </p>
          <p className="border-t border-slate-400 pt-2 text-center text-sm">
            Aceite do contratado
          </p>
        </footer>
      </article>
      {!readOnly ? <p className="hide-on-print text-xs text-slate-500">
        Ao imprimir, escolha “Salvar como PDF” para exportar uma cópia. O documento permanece
        apenas nesta sessão.
      </p> : null}
    </main>
  );
}
