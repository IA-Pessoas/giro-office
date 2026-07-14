import { useState, type FormEvent } from "react";
import { AlertCircle, Landmark, Loader2, Pencil, Plus, RefreshCw, X } from "lucide-react";

import { cn } from "@shared/ui/newLayout/utils";
import { formatCPF_CNPJ } from "@shared/utils/formatters";

import {
  useCreatePessoalUnionMutation,
  usePessoalUnions,
  useUpdatePessoalUnionMutation,
} from "../hooks/usePessoalUnions";
import type { PessoalUnion, PessoalUnionPayload } from "../types/unions";
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";

interface PessoalUnionsSectionProps {
  canEdit: boolean;
}

type UnionFormValues = {
  name: string;
  cnpj: string;
  base_date: string;
};

const emptyUnionFormValues: UnionFormValues = {
  name: "",
  cnpj: "",
  base_date: "",
};

const unionFields = [
  { name: "name", label: "Nome", type: "text" },
  { name: "cnpj", label: "CNPJ", type: "text" },
  { name: "base_date", label: "Data-base", type: "date" },
] as const;

function buildUnionFormValues(union: PessoalUnion | null): UnionFormValues {
  if (!union) {
    return emptyUnionFormValues;
  }

  return {
    name: union.name,
    cnpj: union.cnpj,
    base_date: union.base_date ? union.base_date.slice(0, 10) : "",
  };
}

function buildUnionFormPayload(values: UnionFormValues): PessoalUnionPayload {
  return {
    name: values.name.trim(),
    cnpj: values.cnpj.trim(),
    base_date: values.base_date || null,
  };
}

function formatUnionDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function getPessoalErrorMessage(error: unknown, fallback: string): string {
  if (error !== null && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })
      .response?.data;
    const message = data?.error ?? data?.message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function PessoalUnionsSection({ canEdit }: PessoalUnionsSectionProps) {
  const unionsQuery = usePessoalUnions();
  const createMutation = useCreatePessoalUnionMutation();
  const [selectedUnion, setSelectedUnion] = useState<PessoalUnion | null>(null);
  const updateMutation = useUpdatePessoalUnionMutation(selectedUnion?.id ?? "");
  const [formValues, setFormValues] = useState<UnionFormValues>(emptyUnionFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const unions = unionsQuery.data ?? [];
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function handleStartCreate() {
    setSelectedUnion(null);
    setFormValues(emptyUnionFormValues);
    setFormError(null);
  }

  function handleStartEdit(union: PessoalUnion) {
    setSelectedUnion(union);
    setFormValues(buildUnionFormValues(union));
    setFormError(null);
  }

  function handleFieldChange(field: keyof UnionFormValues, value: string) {
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

    const payload = buildUnionFormPayload(formValues);

    if (!payload.name || !payload.cnpj) {
      setFormError("Informe nome e CNPJ.");
      return;
    }

    setFormError(null);

    try {
      const savedUnion = selectedUnion
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload);

      setSelectedUnion(savedUnion);
      setFormValues(buildUnionFormValues(savedUnion));
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Nao foi possivel salvar o sindicato."));
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-pink-600 dark:text-pink-300" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Sindicatos
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Cadastros usados na folha e nas rotinas de data-base.
            </p>
          </div>

          <button
            type="button"
            onClick={() => unionsQuery.refetch()}
            disabled={unionsQuery.isFetching}
            className={pessoalSecondaryButtonClassName}
          >
            {unionsQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {unionsQuery.isLoading ? (
            <StateMessage icon={Loader2} title="Carregando sindicatos" tone="loading">
              Buscando os cadastros disponiveis para esta organizacao.
            </StateMessage>
          ) : null}

          {unionsQuery.isError ? (
            <StateMessage icon={AlertCircle} title="Nao foi possivel carregar" tone="danger">
              {getPessoalErrorMessage(unionsQuery.error, "Falha ao carregar sindicatos.")}
            </StateMessage>
          ) : null}

          {!unionsQuery.isLoading && !unionsQuery.isError && unions.length === 0 ? (
            <StateMessage icon={Landmark} title="Nenhum sindicato cadastrado">
              {canEdit
                ? "Use o formulario ao lado para criar o primeiro sindicato."
                : "Nao ha sindicatos cadastrados para esta organizacao."}
            </StateMessage>
          ) : null}

          {!unionsQuery.isLoading && !unionsQuery.isError && unions.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="min-w-[640px] divide-y divide-gray-200 text-sm dark:divide-slate-700">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">CNPJ</th>
                    <th className="px-4 py-3">Data-base</th>
                    {canEdit ? <th className="px-4 py-3 text-right">Acao</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {unions.map((union) => (
                    <tr
                      key={union.id}
                      className={cn(
                        "bg-white dark:bg-slate-900",
                        selectedUnion?.id === union.id && "bg-pink-50 dark:bg-pink-950/20",
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {union.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatCPF_CNPJ(union.cnpj) || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatUnionDate(union.base_date)}
                      </td>
                      {canEdit ? (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(union)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-pink-700 transition-colors hover:bg-pink-50 dark:text-pink-300 dark:hover:bg-pink-950/30"
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {canEdit ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {selectedUnion ? "Editar sindicato" : "Novo sindicato"}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Informe os dados do sindicato.
                </p>
              </div>
              {selectedUnion ? (
                <button
                  type="button"
                  onClick={handleStartCreate}
                  disabled={isSubmitting}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800"
                  aria-label="Limpar selecao"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {unionFields.map((field) => (
              <label
                key={field.name}
                className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                {field.label}
                <input
                  type={field.type}
                  value={formValues[field.name]}
                  onChange={(event) => handleFieldChange(field.name, event.target.value)}
                  disabled={isSubmitting}
                  className={pessoalTextFieldClassName}
                />
              </label>
            ))}

            {formError ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-300">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className={pessoalPrimaryButtonClassName}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : selectedUnion ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {selectedUnion ? "Salvar alteracoes" : "Criar sindicato"}
            </button>
          </form>
        ) : (
          <StateMessage icon={AlertCircle} title="Modo visualizacao">
            Voce pode consultar sindicatos, mas nao tem permissao para alterar cadastros.
          </StateMessage>
        )}
      </aside>
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
          "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-900/50 dark:bg-pink-950/20 dark:text-pink-100",
        tone === "neutral" &&
          "border-dashed border-gray-200 bg-gray-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
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
