import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "react-toastify";

import {
  useCreateFiscalIpiMutation,
  useFiscalIpiDetail,
  useUpdateFiscalIpiMutation,
} from "../hooks";
import type { CreateFiscalIpiPayload, FiscalIpi } from "../types";
import { getFiscalErrorMessage } from "../utils";

type FiscalIpiFormPanelMode = "create" | "edit";

interface FiscalIpiFormPanelProps {
  mode: FiscalIpiFormPanelMode;
  ipiId?: string;
  searchCodes: string[];
  onClose: () => void;
  showHeader?: boolean;
  bare?: boolean;
}

interface FiscalIpiFormState {
  ncm: string;
  ex: string;
  description: string;
  aliquot: string;
}

const DEFAULT_FORM_STATE: FiscalIpiFormState = {
  ncm: "",
  ex: "",
  description: "",
  aliquot: "",
};

function buildFormState(ipi: FiscalIpi | null | undefined): FiscalIpiFormState {
  if (!ipi) {
    return DEFAULT_FORM_STATE;
  }

  return {
    ncm: ipi.ncm,
    ex: ipi.ex ?? "",
    description: ipi.description ?? "",
    aliquot: ipi.aliquot ?? "",
  };
}

function normalizeOptionalText(value: string) {
  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : undefined;
}

export function FiscalIpiFormPanel({
  mode,
  ipiId,
  searchCodes,
  onClose,
  showHeader = true,
  bare = false,
}: FiscalIpiFormPanelProps) {
  const detailQuery = useFiscalIpiDetail(ipiId, mode === "edit");
  const createMutation = useCreateFiscalIpiMutation();
  const updateMutation = useUpdateFiscalIpiMutation();
  const [formState, setFormState] = useState<FiscalIpiFormState>(DEFAULT_FORM_STATE);
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
  }, [detailQuery.data, ipiId, isEditing]);

  function handleChange<K extends keyof FiscalIpiFormState>(
    key: K,
    value: FiscalIpiFormState[K],
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
    if (!formState.ncm.trim()) {
      setValidationMessage("Preencha o código NCM antes de salvar.");
      return;
    }

    setValidationMessage(null);

    const basePayload: CreateFiscalIpiPayload = {
      ncm: formState.ncm.trim(),
      ex: normalizeOptionalText(formState.ex),
      description: normalizeOptionalText(formState.description),
      aliquot: normalizeOptionalText(formState.aliquot),
    };

    try {
      if (isEditing && ipiId) {
        await updateMutation.mutateAsync({
          ...basePayload,
          ipi_id: ipiId,
        });
        toast.success("IPI atualizado com sucesso.");
      } else {
        const createdIpi = await createMutation.mutateAsync(basePayload);

        if (!searchCodes.includes(createdIpi.ncm)) {
          toast.success("Cadastro criado. Inclua o código NCM na busca para visualizar.");
        } else {
          toast.success("IPI cadastrado com sucesso.");
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
          Carregando dados do IPI para edição.
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
              <p className="font-semibold">Não foi possível carregar o IPI selecionado.</p>
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
              {isEditing ? "Editar IPI" : "Novo IPI"}
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
          label="Código NCM"
          value={formState.ncm}
          onChange={(value) => handleChange("ncm", value)}
          placeholder="Ex.: 84719012"
          required
        />
        <TextField
          label="EX"
          value={formState.ex}
          onChange={(value) => handleChange("ex", value)}
        />
        <TextField
          label="Descrição"
          value={formState.description}
          onChange={(value) => handleChange("description", value)}
          placeholder="Descreva o registro de IPI"
        />
        <TextField
          label="Alíquota"
          value={formState.aliquot}
          onChange={(value) => handleChange("aliquot", value)}
          placeholder="Ex.: 5,00"
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
            "Criar IPI"
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
