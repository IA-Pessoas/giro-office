import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, ChevronDown, Loader2, RefreshCw, Save, WalletCards } from "lucide-react";

import { useAssignableUsers } from "@modules/rh";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreatePessoalPayrollMutation,
  usePessoalPayroll,
  useUpdatePessoalPayrollMutation,
} from "../hooks/usePessoalPayroll";
import { usePessoalUnions } from "../hooks/usePessoalUnions";
import type { PessoalPayroll, PessoalPayrollPayload } from "../types/payroll";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalCheckboxCardClassName,
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";
import { finiteNumber, optional } from "./pessoalFormValueHelpers";
import { PessoalPlaceholderSection } from "./PessoalPlaceholderSection";

interface PessoalPayrollSectionProps {
  selectedClientId: string;
  canEdit: boolean;
}

type PayrollFormValues = {
  responsible_id: string;
  advance: boolean;
  advance_type: string;
  advance_amount: string;
  info: string;
  previous: boolean;
  onvio: boolean;
  group: string;
  vt: boolean;
  vt_value: string;
  vt_type: string;
  va: boolean;
  assistance_fee: boolean;
  union_id: string;
  bem_mais: boolean;
  bsf: boolean;
  reinf: boolean;
  employees: string;
  contact: string;
};

const emptyPayrollFormValues: PayrollFormValues = {
  responsible_id: "",
  advance: false,
  advance_type: "",
  advance_amount: "",
  info: "",
  previous: false,
  onvio: false,
  group: "",
  vt: false,
  vt_value: "",
  vt_type: "",
  va: false,
  assistance_fee: false,
  union_id: "",
  bem_mais: false,
  bsf: false,
  reinf: false,
  employees: "0",
  contact: "",
};

const textFields = [
  { name: "info", label: "Informações", type: "text", required: true },
  { name: "group", label: "Grupo", type: "text", required: true },
  { name: "advance_type", label: "Tipo de adiantamento", type: "text", required: false },
  { name: "vt_type", label: "Tipo de VT", type: "text", required: false },
  { name: "contact", label: "Contato", type: "text", required: false },
] as const;

const numberFields = [
  { name: "employees", label: "Funcionários", required: true },
  { name: "advance_amount", label: "Valor do adiantamento", required: false },
  { name: "vt_value", label: "Valor do VT", required: false },
] as const;

const checkboxFields = [
  { name: "advance", label: "Adiantamento" },
  { name: "previous", label: "Folha anterior" },
  { name: "onvio", label: "Onvio" },
  { name: "vt", label: "Vale-transporte" },
  { name: "va", label: "Vale-alimentação" },
  { name: "assistance_fee", label: "Contribuição assistencial" },
  { name: "bem_mais", label: "Bem Mais" },
  { name: "bsf", label: "BSF" },
  { name: "reinf", label: "Reinf" },
] as const;

function buildPayrollFormValues(
  payroll: PessoalPayroll | null,
  selectedClientId: string,
): PayrollFormValues {
  if (!payroll || payroll.client_id !== selectedClientId) {
    return emptyPayrollFormValues;
  }

  return {
    responsible_id: payroll.responsible_id ?? "",
    advance: payroll.advance,
    advance_type: payroll.advance_type ?? "",
    advance_amount: payroll.advance_amount === null ? "" : String(payroll.advance_amount),
    info: payroll.info,
    previous: payroll.previous,
    onvio: payroll.onvio,
    group: payroll.group,
    vt: payroll.vt,
    vt_value: payroll.vt_value === null ? "" : String(payroll.vt_value),
    vt_type: payroll.vt_type ?? "",
    va: payroll.va,
    assistance_fee: payroll.assistance_fee,
    union_id: payroll.union_id ?? "",
    bem_mais: payroll.bem_mais,
    bsf: payroll.bsf,
    reinf: payroll.reinf,
    employees: String(payroll.employees),
    contact: payroll.contact ?? "",
  };
}

function buildPayrollFormPayload(
  selectedClientId: string,
  values: PayrollFormValues,
): PessoalPayrollPayload {
  return {
    client_id: selectedClientId,
    responsible_id: optional(values.responsible_id),
    advance: values.advance,
    advance_type: optional(values.advance_type),
    advance_amount: optional(values.advance_amount, finiteNumber),
    info: values.info.trim(),
    previous: values.previous,
    onvio: values.onvio,
    group: values.group.trim(),
    vt: values.vt,
    vt_value: optional(values.vt_value, finiteNumber),
    vt_type: optional(values.vt_type),
    va: values.va,
    assistance_fee: values.assistance_fee,
    union_id: optional(values.union_id),
    bem_mais: values.bem_mais,
    bsf: values.bsf,
    reinf: values.reinf,
    employees: Number(values.employees),
    contact: optional(values.contact),
  };
}

export function PessoalPayrollSection({
  selectedClientId,
  canEdit,
}: PessoalPayrollSectionProps) {
  const hasClient = selectedClientId.length > 0;
  const payrollQuery = usePessoalPayroll(selectedClientId, hasClient);
  const unionsQuery = usePessoalUnions();
  const responsibleUsersQuery = useAssignableUsers({ enabled: canEdit, module: "pessoal" });
  const createMutation = useCreatePessoalPayrollMutation();
  const updateMutation = useUpdatePessoalPayrollMutation(selectedClientId);
  const [formValues, setFormValues] = useState<PayrollFormValues>(emptyPayrollFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const payroll = payrollQuery.data ?? null;
  const responsibleUsers = responsibleUsersQuery.data ?? [];
  const hasSelectedResponsible = responsibleUsers.some(
    (user) => user.id === formValues.responsible_id,
  );
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isFormDisabled = !canEdit || payrollQuery.isLoading || isSubmitting;

  useEffect(() => {
    setFormValues(buildPayrollFormValues(payrollQuery.data ?? null, selectedClientId));
    setFormError(null);
    setSuccessMessage(null);
  }, [payrollQuery.data, selectedClientId]);

  if (!hasClient) {
    return (
      <PessoalPlaceholderSection
        icon={WalletCards}
        title="Folha"
        description="Selecione um cliente para continuar."
        requiresClient
        hasClient={false}
      />
    );
  }

  function handleFieldChange(field: keyof PayrollFormValues, value: string | boolean) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const payload = buildPayrollFormPayload(selectedClientId, formValues);
    const hasInvalidNumber = [
      payload.advance_amount,
      payload.vt_value,
      payload.employees,
    ].some((value) => typeof value === "number" && Number.isNaN(value));

    if (!payload.info || !payload.group) {
      setFormError("Informe pelo menos informações e grupo.");
      return;
    }

    const hasNegativeMoneyValue =
      (typeof payload.advance_amount === "number" && payload.advance_amount < 0) ||
      (typeof payload.vt_value === "number" && payload.vt_value < 0);

    if (hasInvalidNumber || payload.employees < 0) {
      setFormError("Revise os campos numéricos.");
      return;
    }

    if (hasNegativeMoneyValue) {
      setFormError("Valores monetários não podem ser negativos.");
      return;
    }

    setFormError(null);
    setSuccessMessage(null);

    try {
      const savedPayroll = payroll
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload);

      setFormValues(buildPayrollFormValues(savedPayroll, selectedClientId));
      setSuccessMessage("Configuração de folha salva.");
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível salvar a folha."));
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Folha</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Configuração mensal usada nas obrigações do cliente selecionado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => payrollQuery.refetch()}
              disabled={payrollQuery.isFetching}
              className={pessoalSecondaryButtonClassName}
            >
              {payrollQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </button>
            {canEdit ? (
              <button type="submit" disabled={isFormDisabled} className={pessoalPrimaryButtonClassName}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {payroll ? "Salvar alterações" : "Criar configuração"}
              </button>
            ) : null}
          </div>
        </div>

        {payrollQuery.isLoading ? (
          <StateMessage icon={Loader2} title="Carregando folha" tone="loading">
            Buscando a configuração do cliente selecionado.
          </StateMessage>
        ) : null}

        {payrollQuery.isError ? (
          <StateMessage icon={AlertCircle} title="Não foi possível carregar" tone="danger">
            {getPessoalErrorMessage(payrollQuery.error, "Falha ao carregar folha.")}
          </StateMessage>
        ) : null}

        {!payrollQuery.isLoading && !payrollQuery.isError && !payroll ? (
          <StateMessage icon={WalletCards} title="Folha não cadastrada">
            Nenhuma configuração de folha cadastrada para este cliente.
          </StateMessage>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {textFields.map((field) => (
            <label
              key={field.name}
              className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              {field.label}
              <input
                type={field.type}
                required={field.required}
                value={String(formValues[field.name])}
                onChange={(event) => handleFieldChange(field.name, event.target.value)}
                disabled={isFormDisabled}
                className={pessoalTextFieldClassName}
              />
            </label>
          ))}

          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            Responsável
            <div className="relative">
              <select
                value={formValues.responsible_id}
                onChange={(event) => handleFieldChange("responsible_id", event.target.value)}
                disabled={
                  isFormDisabled || responsibleUsersQuery.isLoading || responsibleUsersQuery.isError
                }
                className={`${pessoalTextFieldClassName} appearance-none pr-12`}
              >
                <option value="">
                  {responsibleUsersQuery.isLoading
                    ? "Carregando responsáveis"
                    : responsibleUsersQuery.isError
                      ? "Responsáveis indisponíveis"
                      : "Sem responsável"}
                </option>
                {formValues.responsible_id && !hasSelectedResponsible ? (
                  <option value={formValues.responsible_id}>Responsável atual</option>
                ) : null}
                {responsibleUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            </div>
          </label>

          {numberFields.map((field) => (
            <label
              key={field.name}
              className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              {field.label}
              <input
                type="number"
                required={field.required}
                min={0}
                step={field.name === "employees" ? 1 : "0.01"}
                value={String(formValues[field.name])}
                onChange={(event) => handleFieldChange(field.name, event.target.value)}
                disabled={isFormDisabled}
                className={pessoalTextFieldClassName}
              />
            </label>
          ))}

          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            Sindicato
            <div className="relative">
              <select
                value={formValues.union_id}
                onChange={(event) => handleFieldChange("union_id", event.target.value)}
                disabled={isFormDisabled || unionsQuery.isLoading}
                className={`${pessoalTextFieldClassName} appearance-none pr-12`}
              >
                <option value="">Sem sindicato</option>
                {(unionsQuery.data ?? []).map((union) => (
                  <option key={union.id} value={union.id}>
                    {union.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            </div>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {checkboxFields.map((field) => (
            <label
              key={field.name}
              className={pessoalCheckboxCardClassName}
            >
              <input
                type="checkbox"
                checked={Boolean(formValues[field.name])}
                onChange={(event) => handleFieldChange(field.name, event.target.checked)}
                disabled={isFormDisabled}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {field.label}
            </label>
          ))}
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {formError}
          </p>
        ) : null}

        {successMessage ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{successMessage}</p>
        ) : null}
      </form>
    </section>
  );
}

function StateMessage({
  children,
  icon: Icon,
  title,
  tone = "neutral",
}: {
  children: string;
  icon: typeof AlertCircle;
  title: string;
  tone?: "danger" | "loading" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-sm",
        tone === "danger" &&
          "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100",
        tone === "loading" &&
          cn(
            "border-blue-200 bg-blue-50 text-blue-800",
            "dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100",
          ),
        tone === "neutral" &&
          cn(
            "border-dashed border-gray-200 bg-gray-50 text-gray-600",
            "dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
          ),
      )}
    >
      <div className="flex gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            tone === "loading" && "animate-spin",
          )}
        />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1">{children}</p>
        </div>
      </div>
    </div>
  );
}
