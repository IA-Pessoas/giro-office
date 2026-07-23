import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Dialog } from "@shared/components";
import { ClientSelectionField } from "@modules/clients";

import type {
  CreateRegularizeMunicipalTaxPayload,
  RegularizeMunicipalTaxesDetail,
  UpdateRegularizeMunicipalTaxPayload,
} from "../types";
import {
  getRegularizeMutationErrorMessage,
  toRegularizeInputDate,
  toRegularizeRequiredNumber,
  trimRegularizeNullableText,
} from "../utils/regularizeForm";
import {
  RegularizeFormActions,
  RegularizeFormError,
  RegularizeFormField,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

type RegularizeMunicipalTaxesFormState = {
  client_id: string;
  year: string;
  tff_is_applicable: boolean;
  tff_amount: string;
  tff_notes: string;
  tff_analysis_is_done: boolean;
  tff_analysis_notes: string;
  tff_sent_date: string;
  tff_due_date: string;
  tlp_is_applicable: boolean;
  tlp_amount: string;
  tlp_notes: string;
  tlp_is_sent: string;
  tlp_sent_date: string;
  tlp_due_date: string;
  tlp_not_email: boolean;
  tll_is_applicable: boolean;
  tll_amount: string;
  tll_notes: string;
  tll_is_sent: string;
  tll_sent_date: string;
  tll_due_date: string;
  tll_analysis_is_done: boolean;
  tll_analysis_notes: string;
};

function getRegularizeMunicipalTaxYearOptions(currentYear: number, selectedYear: string): string[] {
  const years = new Set<string>();

  for (let year = currentYear - 2; year <= currentYear + 2; year += 1) {
    years.add(String(year));
  }

  const normalizedSelectedYear = selectedYear.trim();

  if (normalizedSelectedYear) {
    years.add(normalizedSelectedYear);
  }

  return Array.from(years).sort((first, second) => Number(second) - Number(first));
}

function toRegularizeYesNo(value: boolean | string | null | undefined): "Sim" | "Não" {
  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return normalized === "sim" || normalized === "true" ? "Sim" : "Não";
}

function buildMunicipalTaxesFormState(
  municipalTax: RegularizeMunicipalTaxesDetail | null,
  defaultClientId: string,
  currentYear: number,
): RegularizeMunicipalTaxesFormState {
  if (!municipalTax) {
    return {
      client_id: defaultClientId,
      year: String(currentYear),
      tff_is_applicable: false,
      tff_amount: "0",
      tff_notes: "",
      tff_analysis_is_done: false,
      tff_analysis_notes: "",
      tff_sent_date: "",
      tff_due_date: "",
      tlp_is_applicable: false,
      tlp_amount: "0",
      tlp_notes: "",
      tlp_is_sent: "Não",
      tlp_sent_date: "",
      tlp_due_date: "",
      tlp_not_email: false,
      tll_is_applicable: false,
      tll_amount: "0",
      tll_notes: "",
      tll_is_sent: "Não",
      tll_sent_date: "",
      tll_due_date: "",
      tll_analysis_is_done: false,
      tll_analysis_notes: "",
    };
  }

  return {
    client_id: municipalTax.client_id,
    year: String(municipalTax.year),
    tff_is_applicable: Boolean(municipalTax.tff_is_applicable),
    tff_amount: String(municipalTax.tff_amount ?? 0),
    tff_notes: municipalTax.tff_notes ?? "",
    tff_analysis_is_done: Boolean(municipalTax.tff_analysis_is_done),
    tff_analysis_notes: municipalTax.tff_analysis_notes ?? "",
    tff_sent_date: toRegularizeInputDate(municipalTax.tff_sent_date),
    tff_due_date: toRegularizeInputDate(municipalTax.tff_due_date),
    tlp_is_applicable: Boolean(municipalTax.tlp_is_applicable),
    tlp_amount: String(municipalTax.tlp_amount ?? 0),
    tlp_notes: municipalTax.tlp_notes ?? "",
    tlp_is_sent: toRegularizeYesNo(municipalTax.tlp_is_sent),
    tlp_sent_date: toRegularizeInputDate(municipalTax.tlp_sent_date),
    tlp_due_date: toRegularizeInputDate(municipalTax.tlp_due_date),
    tlp_not_email: Boolean(municipalTax.tlp_not_email),
    tll_is_applicable: Boolean(municipalTax.tll_is_applicable),
    tll_amount: String(municipalTax.tll_amount ?? 0),
    tll_notes: municipalTax.tll_notes ?? "",
    tll_is_sent: toRegularizeYesNo(municipalTax.tll_is_sent),
    tll_sent_date: toRegularizeInputDate(municipalTax.tll_sent_date),
    tll_due_date: toRegularizeInputDate(municipalTax.tll_due_date),
    tll_analysis_is_done: Boolean(municipalTax.tll_analysis_is_done),
    tll_analysis_notes: municipalTax.tll_analysis_notes ?? "",
  };
}

function buildMunicipalTaxesPayload(
  formState: RegularizeMunicipalTaxesFormState,
): CreateRegularizeMunicipalTaxPayload {
  return {
    client_id: formState.client_id,
    year: toRegularizeRequiredNumber(formState.year),
    tff_is_applicable: formState.tff_is_applicable,
    tff_amount: toRegularizeRequiredNumber(formState.tff_amount),
    tff_notes: trimRegularizeNullableText(formState.tff_notes),
    tff_analysis_is_done: formState.tff_analysis_is_done,
    tff_analysis_notes: trimRegularizeNullableText(formState.tff_analysis_notes),
    tff_sent_date: formState.tff_sent_date || undefined,
    tff_due_date: formState.tff_due_date || undefined,
    tlp_is_applicable: formState.tlp_is_applicable,
    tlp_amount: toRegularizeRequiredNumber(formState.tlp_amount),
    tlp_notes: trimRegularizeNullableText(formState.tlp_notes),
    tlp_is_sent: formState.tlp_is_sent,
    tlp_sent_date: formState.tlp_sent_date || undefined,
    tlp_due_date: formState.tlp_due_date || undefined,
    tlp_not_email: formState.tlp_not_email,
    tll_is_applicable: formState.tll_is_applicable,
    tll_amount: toRegularizeRequiredNumber(formState.tll_amount),
    tll_notes: trimRegularizeNullableText(formState.tll_notes),
    tll_is_sent: formState.tll_is_sent,
    tll_sent_date: formState.tll_sent_date || undefined,
    tll_due_date: formState.tll_due_date || undefined,
    tll_analysis_is_done: formState.tll_analysis_is_done,
    tll_analysis_notes: trimRegularizeNullableText(formState.tll_analysis_notes),
  };
}

function RegularizeBooleanField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      {label}
    </label>
  );
}

export function RegularizeMunicipalTaxesForm({
  currentYear,
  defaultClientId,
  isLoadingInitialValue = false,
  isSubmitting,
  mode,
  municipalTax,
  onClose,
  onSubmit,
  open,
}: {
  currentYear: number;
  defaultClientId: string;
  isLoadingInitialValue?: boolean;
  isSubmitting: boolean;
  mode: "create" | "edit";
  municipalTax: RegularizeMunicipalTaxesDetail | null;
  onClose: () => void;
  onSubmit: (
    payload: CreateRegularizeMunicipalTaxPayload | UpdateRegularizeMunicipalTaxPayload,
  ) => Promise<void>;
  open: boolean;
}) {
  const [formState, setFormState] = useState<RegularizeMunicipalTaxesFormState>(
    buildMunicipalTaxesFormState(municipalTax, defaultClientId, currentYear),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = mode === "edit";
  const yearOptions = useMemo(
    () => getRegularizeMunicipalTaxYearOptions(currentYear, formState.year),
    [currentYear, formState.year],
  );

  useEffect(() => {
    if (open) {
      setFormState(buildMunicipalTaxesFormState(municipalTax, defaultClientId, currentYear));
      setFormError(null);
    }
  }, [currentYear, defaultClientId, municipalTax, open]);

  function handleChange<K extends keyof RegularizeMunicipalTaxesFormState>(
    key: K,
    value: RegularizeMunicipalTaxesFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (isLoadingInitialValue) {
      return;
    }

    if (isEditing && !municipalTax) {
      setFormError("Não foi possível carregar os dados do tributo.");
      return;
    }

    if (
      !formState.client_id ||
      !formState.year.trim() ||
      !formState.tlp_is_sent.trim() ||
      !formState.tll_is_sent.trim()
    ) {
      setFormError("Preencha os campos obrigatórios.");
      return;
    }

    try {
      const payload = buildMunicipalTaxesPayload(formState);

      if (isEditing && municipalTax) {
        await onSubmit({
          ...payload,
          id: municipalTax.id,
        });
      } else {
        await onSubmit(payload);
      }
    } catch (error) {
      setFormError(getRegularizeMutationErrorMessage(error, "Não foi possível salvar o tributo."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title={isEditing ? "Editar tributo" : "Novo tributo"}
      description="Formulário de tributos municipais do Regularize."
      contentClassName="w-[min(94vw,980px)]"
      bodyClassName="max-h-[72vh] overflow-y-auto"
    >
      {isLoadingInitialValue ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          Carregando dados...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <RegularizeFormError message={formError} />

          <div className="grid gap-4 md:grid-cols-3">
            <RegularizeFormField label="Cliente" required className="md:col-span-2">
              <ClientSelectionField clientId={formState.client_id} />
            </RegularizeFormField>

            <RegularizeFormField label="Ano" required>
              <RegularizeNativeSelect
                value={formState.year}
                onChange={(event) => handleChange("year", event.target.value)}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </RegularizeNativeSelect>
            </RegularizeFormField>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">TFF</h3>
              <RegularizeBooleanField
                label="Aplicável"
                checked={formState.tff_is_applicable}
                onChange={(value) => handleChange("tff_is_applicable", value)}
              />
              <RegularizeFormField label="Valor" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.tff_amount}
                  onChange={(event) => handleChange("tff_amount", event.target.value)}
                  className={regularizeTextFieldClassName}
                />
              </RegularizeFormField>
              <RegularizeBooleanField
                label="Análise concluída"
                checked={formState.tff_analysis_is_done}
                onChange={(value) => handleChange("tff_analysis_is_done", value)}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <RegularizeFormField label="Enviado em">
                  <input
                    type="date"
                    value={formState.tff_sent_date}
                    onChange={(event) => handleChange("tff_sent_date", event.target.value)}
                    className={regularizeTextFieldClassName}
                  />
                </RegularizeFormField>
                <RegularizeFormField label="Vencimento">
                  <input
                    type="date"
                    value={formState.tff_due_date}
                    onChange={(event) => handleChange("tff_due_date", event.target.value)}
                    className={regularizeTextFieldClassName}
                  />
                </RegularizeFormField>
              </div>
              <RegularizeFormField label="Observações">
                <textarea
                  value={formState.tff_notes}
                  onChange={(event) => handleChange("tff_notes", event.target.value)}
                  className={regularizeTextareaClassName}
                />
              </RegularizeFormField>
            </section>

            <section className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">TLP</h3>
              <RegularizeBooleanField
                label="Aplicável"
                checked={formState.tlp_is_applicable}
                onChange={(value) => handleChange("tlp_is_applicable", value)}
              />
              <RegularizeFormField label="Valor" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.tlp_amount}
                  onChange={(event) => handleChange("tlp_amount", event.target.value)}
                  className={regularizeTextFieldClassName}
                />
              </RegularizeFormField>
              <RegularizeFormField label="Enviado?" required>
                <RegularizeNativeSelect
                  value={formState.tlp_is_sent}
                  onChange={(event) => handleChange("tlp_is_sent", event.target.value)}
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </RegularizeNativeSelect>
              </RegularizeFormField>
              <RegularizeBooleanField
                label="Não enviar por e-mail"
                checked={formState.tlp_not_email}
                onChange={(value) => handleChange("tlp_not_email", value)}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <RegularizeFormField label="Enviado em">
                  <input
                    type="date"
                    value={formState.tlp_sent_date}
                    onChange={(event) => handleChange("tlp_sent_date", event.target.value)}
                    className={regularizeTextFieldClassName}
                  />
                </RegularizeFormField>
                <RegularizeFormField label="Vencimento">
                  <input
                    type="date"
                    value={formState.tlp_due_date}
                    onChange={(event) => handleChange("tlp_due_date", event.target.value)}
                    className={regularizeTextFieldClassName}
                  />
                </RegularizeFormField>
              </div>
              <RegularizeFormField label="Observações">
                <textarea
                  value={formState.tlp_notes}
                  onChange={(event) => handleChange("tlp_notes", event.target.value)}
                  className={regularizeTextareaClassName}
                />
              </RegularizeFormField>
            </section>

            <section className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">TLL</h3>
              <RegularizeBooleanField
                label="Aplicável"
                checked={formState.tll_is_applicable}
                onChange={(value) => handleChange("tll_is_applicable", value)}
              />
              <RegularizeFormField label="Valor" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.tll_amount}
                  onChange={(event) => handleChange("tll_amount", event.target.value)}
                  className={regularizeTextFieldClassName}
                />
              </RegularizeFormField>
              <RegularizeFormField label="Enviado?" required>
                <RegularizeNativeSelect
                  value={formState.tll_is_sent}
                  onChange={(event) => handleChange("tll_is_sent", event.target.value)}
                >
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </RegularizeNativeSelect>
              </RegularizeFormField>
              <RegularizeBooleanField
                label="Análise concluída"
                checked={formState.tll_analysis_is_done}
                onChange={(value) => handleChange("tll_analysis_is_done", value)}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <RegularizeFormField label="Enviado em">
                  <input
                    type="date"
                    value={formState.tll_sent_date}
                    onChange={(event) => handleChange("tll_sent_date", event.target.value)}
                    className={regularizeTextFieldClassName}
                  />
                </RegularizeFormField>
                <RegularizeFormField label="Vencimento">
                  <input
                    type="date"
                    value={formState.tll_due_date}
                    onChange={(event) => handleChange("tll_due_date", event.target.value)}
                    className={regularizeTextFieldClassName}
                  />
                </RegularizeFormField>
              </div>
              <RegularizeFormField label="Observações">
                <textarea
                  value={formState.tll_notes}
                  onChange={(event) => handleChange("tll_notes", event.target.value)}
                  className={regularizeTextareaClassName}
                />
              </RegularizeFormField>
            </section>
          </div>

          <RegularizeFormActions
            isSubmitting={isSubmitting}
            onCancel={onClose}
            submitLabel={isEditing ? "Salvar alterações" : "Criar tributo"}
          />
        </form>
      )}
    </Dialog>
  );
}
