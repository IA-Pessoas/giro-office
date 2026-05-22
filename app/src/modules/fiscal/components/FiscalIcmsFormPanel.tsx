import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "react-toastify";

import {
  useCreateFiscalIcmsMutation,
  useFiscalIcmsDetail,
  useUpdateFiscalIcmsMutation,
} from "../hooks";
import type { CreateFiscalIcmsPayload, FiscalIcms } from "../types";
import { getFiscalErrorMessage } from "../utils";

type FiscalIcmsFormPanelMode = "create" | "edit";

interface FiscalIcmsFormPanelProps {
  mode: FiscalIcmsFormPanelMode;
  icmsId?: string;
  searchDescriptions: string[];
  onClose: () => void;
  showHeader?: boolean;
  bare?: boolean;
}

interface FiscalIcmsFormState {
  state: string;
  item_number: string;
  cest_code: string;
  description: string;
  interstate_agreement: string;
  applied_original_mva: string;
  adjusted_mva: string;
  original_mva: string;
}

const DEFAULT_FORM_STATE: FiscalIcmsFormState = {
  state: "",
  item_number: "",
  cest_code: "",
  description: "",
  interstate_agreement: "",
  applied_original_mva: "",
  adjusted_mva: "",
  original_mva: "",
};

function buildFormState(icms: FiscalIcms | null | undefined): FiscalIcmsFormState {
  if (!icms) {
    return DEFAULT_FORM_STATE;
  }

  return {
    state: icms.state,
    item_number: icms.item_number ?? "",
    cest_code: icms.cest_code ?? "",
    description: icms.description,
    interstate_agreement: icms.interstate_agreement ?? "",
    applied_original_mva: icms.applied_original_mva ?? "",
    adjusted_mva: icms.adjusted_mva ?? "",
    original_mva: icms.original_mva ?? "",
  };
}

function normalizeOptionalText(value: string) {
  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : undefined;
}

export function FiscalIcmsFormPanel({
  mode,
  icmsId,
  searchDescriptions,
  onClose,
  showHeader = true,
  bare = false,
}: FiscalIcmsFormPanelProps) {
  const detailQuery = useFiscalIcmsDetail(icmsId, mode === "edit");
  const createMutation = useCreateFiscalIcmsMutation();
  const updateMutation = useUpdateFiscalIcmsMutation();
  const [formState, setFormState] = useState<FiscalIcmsFormState>(DEFAULT_FORM_STATE);
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
    setValidationMessage(null);

    if (isEditing) {
      setFormState(buildFormState(detailQuery.data));
      return;
    }

    setFormState(DEFAULT_FORM_STATE);
  }, [detailQuery.data, icmsId, isEditing]);

  function handleChange<K extends keyof FiscalIcmsFormState>(
    key: K,
    value: FiscalIcmsFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));

    if (validationMessage) {
      setValidationMessage(null);
    }

    if (createMutation.error) {
      createMutation.reset();
    }

    if (updateMutation.error) {
      updateMutation.reset();
    }
  }

  function handleCancel() {
    createMutation.reset();
    updateMutation.reset();
    setValidationMessage(null);
    setFormState(isEditing ? buildFormState(detailQuery.data) : DEFAULT_FORM_STATE);
    onClose();
  }

  async function handleSubmit() {
    if (!formState.state.trim() || !formState.description.trim()) {
      setValidationMessage("Preencha a UF e a descrição antes de salvar.");
      return;
    }

    setValidationMessage(null);

    const basePayload: CreateFiscalIcmsPayload = {
      state: formState.state.trim(),
      description: formState.description.trim(),
      item_number: normalizeOptionalText(formState.item_number),
      cest_code: normalizeOptionalText(formState.cest_code),
      interstate_agreement: normalizeOptionalText(formState.interstate_agreement),
      applied_original_mva: normalizeOptionalText(formState.applied_original_mva),
      adjusted_mva: normalizeOptionalText(formState.adjusted_mva),
      original_mva: normalizeOptionalText(formState.original_mva),
    };

    try {
      if (isEditing && icmsId) {
        await updateMutation.mutateAsync({
          ...basePayload,
          icms_id: icmsId,
        });
        toast.success("ICMS atualizado com sucesso.");
      } else {
        const createdIcms = await createMutation.mutateAsync(basePayload);

        if (!searchDescriptions.includes(createdIcms.description)) {
          toast.success("Cadastro criado. Inclua a descrição na busca para visualizar.");
        } else {
          toast.success("ICMS criado com sucesso.");
        }
      }

      setFormState(DEFAULT_FORM_STATE);
      createMutation.reset();
      updateMutation.reset();
      onClose();
    } catch {
      // Inline feedback is rendered below.
    }
  }

  if (isLoadingDetail) {
    return (
      <section
        className={
          bare
            ? "p-0"
            : "rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
        }
      >
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando dados do ICMS para edição.
        </div>
      </section>
    );
  }

  if (isEditing && detailQuery.error && !detailQuery.data) {
    return (
      <section
        className={
          bare
            ? "rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300"
            : "rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Não foi possível carregar o ICMS selecionado.</p>
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
    <section
      className={
        bare
          ? "p-0"
          : "rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/30 dark:bg-blue-900/10"
      }
    >
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {isEditing ? "Editar ICMS" : "Novo ICMS"}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
              Preencha os campos fiscais e salve quando estiver tudo revisado.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 px-3 text-[13px] font-medium text-gray-700 transition-colors hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      ) : null}

      <div className={`${showHeader ? "mt-4" : ""} grid gap-4 xl:grid-cols-2`}>
        <TextField
          label="UF"
          value={formState.state}
          onChange={(value) => handleChange("state", value)}
          placeholder="Ex.: SP"
          required
        />
        <TextField
          label="Descrição"
          value={formState.description}
          onChange={(value) => handleChange("description", value)}
          placeholder="Descreva o registro de ICMS"
          required
        />
        <TextField
          label="Número do item"
          value={formState.item_number}
          onChange={(value) => handleChange("item_number", value)}
        />
        <TextField
          label="Código CEST"
          value={formState.cest_code}
          onChange={(value) => handleChange("cest_code", value)}
        />
        <TextField
          label="Convênio interestadual"
          value={formState.interstate_agreement}
          onChange={(value) => handleChange("interstate_agreement", value)}
        />
        <TextField
          label="MVA aplicada"
          value={formState.applied_original_mva}
          onChange={(value) => handleChange("applied_original_mva", value)}
        />
        <TextField
          label="MVA ajustada"
          value={formState.adjusted_mva}
          onChange={(value) => handleChange("adjusted_mva", value)}
        />
        <TextField
          label="MVA original"
          value={formState.original_mva}
          onChange={(value) => handleChange("original_mva", value)}
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
          className="inline-flex h-9 min-w-[132px] items-center justify-center rounded-lg bg-blue-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </span>
          ) : isEditing ? (
            "Salvar alterações"
          ) : (
            "Criar ICMS"
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
        className="h-9 rounded-lg border border-gray-300 px-3 text-[13px] text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      />
    </label>
  );
}
