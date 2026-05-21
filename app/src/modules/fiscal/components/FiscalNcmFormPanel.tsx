import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "react-toastify";

import {
  useCreateFiscalNcmMutation,
  useFiscalNcmDetail,
  useUpdateFiscalNcmMutation,
} from "../hooks";
import type { CreateFiscalNcmPayload, FiscalNcm } from "../types";
import {
  getFiscalErrorMessage,
  toFiscalInputDate,
  toFiscalIsoDate,
} from "../utils";

type FiscalNcmFormPanelMode = "create" | "edit";

interface FiscalNcmFormPanelProps {
  mode: FiscalNcmFormPanelMode;
  ncmId?: string;
  searchCodes: string[];
  onClose: () => void;
}

interface FiscalNcmFormState {
  tax_regime: string;
  ncm_code: string;
  federal_taxation_type: string;
  description: string;
  ncm_notes: string;
  cst_pis_outgoing: string;
  cst_cofins_outgoing: string;
  product_group: string;
  validity_start_date: string;
  information_source: string;
  reference_legislation: string;
  validity_end_date: string;
}

const DEFAULT_FORM_STATE: FiscalNcmFormState = {
  tax_regime: "",
  ncm_code: "",
  federal_taxation_type: "",
  description: "",
  ncm_notes: "",
  cst_pis_outgoing: "",
  cst_cofins_outgoing: "",
  product_group: "",
  validity_start_date: "",
  information_source: "",
  reference_legislation: "",
  validity_end_date: "",
};

function buildFormState(ncm: FiscalNcm | null | undefined): FiscalNcmFormState {
  if (!ncm) {
    return DEFAULT_FORM_STATE;
  }

  return {
    tax_regime: ncm.tax_regime,
    ncm_code: ncm.ncm_code,
    federal_taxation_type: ncm.federal_taxation_type,
    description: ncm.description,
    ncm_notes: ncm.ncm_notes ?? "",
    cst_pis_outgoing: ncm.cst_pis_outgoing ?? "",
    cst_cofins_outgoing: ncm.cst_cofins_outgoing ?? "",
    product_group: ncm.product_group ?? "",
    validity_start_date: toFiscalInputDate(ncm.validity_start_date),
    information_source: ncm.information_source ?? "",
    reference_legislation: ncm.reference_legislation ?? "",
    validity_end_date: toFiscalInputDate(ncm.validity_end_date),
  };
}

function normalizeOptionalText(value: string) {
  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : undefined;
}

export function FiscalNcmFormPanel({
  mode,
  ncmId,
  searchCodes,
  onClose,
}: FiscalNcmFormPanelProps) {
  const detailQuery = useFiscalNcmDetail(ncmId, mode === "edit");
  const createMutation = useCreateFiscalNcmMutation();
  const updateMutation = useUpdateFiscalNcmMutation();
  const [formState, setFormState] = useState<FiscalNcmFormState>(DEFAULT_FORM_STATE);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const isEditing = mode === "edit";
  const isLoadingDetail = isEditing && detailQuery.isLoading && !detailQuery.data;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const submitErrorMessage = useMemo(() => {
    if (createMutation.error) {
      return getFiscalErrorMessage(createMutation.error);
    }

    if (updateMutation.error) {
      return getFiscalErrorMessage(updateMutation.error);
    }

    return null;
  }, [createMutation.error, updateMutation.error]);

  useEffect(() => {
    if (isEditing) {
      setFormState(buildFormState(detailQuery.data));
      return;
    }

    setFormState(DEFAULT_FORM_STATE);
  }, [detailQuery.data, isEditing, ncmId]);

  function handleChange<K extends keyof FiscalNcmFormState>(
    key: K,
    value: FiscalNcmFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));

    if (validationMessage) {
      setValidationMessage(null);
    }
  }

  function handleCancel() {
    setValidationMessage(null);
    setFormState(isEditing ? buildFormState(detailQuery.data) : DEFAULT_FORM_STATE);
    onClose();
  }

  async function handleSubmit() {
    const startDateIso = toFiscalIsoDate(formState.validity_start_date);
    const endDateIso = toFiscalIsoDate(formState.validity_end_date);

    if (
      !formState.tax_regime.trim() ||
      !formState.ncm_code.trim() ||
      !formState.federal_taxation_type.trim() ||
      !formState.description.trim() ||
      !startDateIso
    ) {
      setValidationMessage(
        "Preencha regime, código NCM, tributação federal, descrição e vigência inicial.",
      );
      return;
    }

    setValidationMessage(null);

    const basePayload: CreateFiscalNcmPayload = {
      tax_regime: formState.tax_regime.trim(),
      ncm_code: formState.ncm_code.trim(),
      federal_taxation_type: formState.federal_taxation_type.trim(),
      description: formState.description.trim(),
      validity_start_date: startDateIso,
      ncm_notes: normalizeOptionalText(formState.ncm_notes),
      cst_pis_outgoing: normalizeOptionalText(formState.cst_pis_outgoing),
      cst_cofins_outgoing: normalizeOptionalText(formState.cst_cofins_outgoing),
      product_group: normalizeOptionalText(formState.product_group),
      information_source: normalizeOptionalText(formState.information_source),
      reference_legislation: normalizeOptionalText(formState.reference_legislation),
      validity_end_date: endDateIso ?? undefined,
    };

    try {
      if (isEditing && ncmId) {
        await updateMutation.mutateAsync({
          ...basePayload,
          ncm_id: ncmId,
        });
        toast.success("NCM atualizado com sucesso.");
      } else {
        const createdNcm = await createMutation.mutateAsync(basePayload);

        if (!searchCodes.includes(createdNcm.ncm_code)) {
          toast.success("Cadastro criado. Inclua o código na busca para visualizar.");
        } else {
          toast.success("NCM criado com sucesso.");
        }
      }

      setFormState(DEFAULT_FORM_STATE);
      onClose();
    } catch {
      // Inline feedback is rendered below.
    }
  }

  if (isLoadingDetail) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando dados do NCM para edição.
        </div>
      </section>
    );
  }

  if (isEditing && detailQuery.error && !detailQuery.data) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Não foi possível carregar o NCM selecionado.</p>
              <p className="mt-1">{getFiscalErrorMessage(detailQuery.error)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-red-100 dark:border-red-900/40 dark:hover:bg-red-900/20"
          >
            Fechar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEditing ? "Editar NCM" : "Novo NCM"}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Preencha os campos fiscais e salve quando estiver tudo revisado.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TextField
          label="Regime tributário"
          value={formState.tax_regime}
          onChange={(value) => handleChange("tax_regime", value)}
          placeholder="Ex.: Simples Nacional"
          required
        />
        <TextField
          label="Código NCM"
          value={formState.ncm_code}
          onChange={(value) => handleChange("ncm_code", value)}
          placeholder="Ex.: 84719012"
          required
        />
        <TextField
          label="Tributação federal"
          value={formState.federal_taxation_type}
          onChange={(value) => handleChange("federal_taxation_type", value)}
          placeholder="Ex.: Monofásica"
          required
        />
        <TextField
          label="Descrição"
          value={formState.description}
          onChange={(value) => handleChange("description", value)}
          placeholder="Descreva o NCM"
          required
        />
        <DateField
          label="Vigência inicial"
          value={formState.validity_start_date}
          onChange={(value) => handleChange("validity_start_date", value)}
          required
        />
        <DateField
          label="Vigência final"
          value={formState.validity_end_date}
          onChange={(value) => handleChange("validity_end_date", value)}
        />
        <TextField
          label="CST PIS saída"
          value={formState.cst_pis_outgoing}
          onChange={(value) => handleChange("cst_pis_outgoing", value)}
        />
        <TextField
          label="CST COFINS saída"
          value={formState.cst_cofins_outgoing}
          onChange={(value) => handleChange("cst_cofins_outgoing", value)}
        />
        <TextField
          label="Grupo de produto"
          value={formState.product_group}
          onChange={(value) => handleChange("product_group", value)}
        />
        <TextField
          label="Fonte da informação"
          value={formState.information_source}
          onChange={(value) => handleChange("information_source", value)}
        />
      </div>

      <div className="mt-4 grid gap-4">
        <TextareaField
          label="Observações do NCM"
          value={formState.ncm_notes}
          onChange={(value) => handleChange("ncm_notes", value)}
          placeholder="Observações complementares"
        />
        <TextareaField
          label="Legislação de referência"
          value={formState.reference_legislation}
          onChange={(value) => handleChange("reference_legislation", value)}
          placeholder="Informe a base legal relacionada"
        />
      </div>

      {validationMessage ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {validationMessage}
        </div>
      ) : null}

      {submitErrorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {submitErrorMessage}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting}
          className="inline-flex min-w-[160px] items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </span>
          ) : isEditing ? (
            "Salvar alterações"
          ) : (
            "Criar NCM"
          )}
        </button>
      </div>
    </section>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  required = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      />
    </label>
  );
}

function DateField({
  label,
  onChange,
  required = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      />
    </label>
  );
}

function TextareaField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      />
    </label>
  );
}
