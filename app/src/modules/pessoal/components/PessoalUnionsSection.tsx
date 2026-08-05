import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-toastify";

import { Dialog, PaginationControls } from "@shared/components";
import { useDebouncedValue } from "@shared/hooks";
import { getLastPage } from "@shared/pagination/pagination";
import { cn } from "@shared/ui/newLayout/utils";
import { formatCPF_CNPJ } from "@shared/utils/formatters";

import {
  useCreatePessoalUnionMutation,
  useDeletePessoalUnionMutation,
  usePaginatedPessoalUnions,
  useUpdatePessoalUnionMutation,
} from "../hooks/usePessoalUnions";
import type { PessoalUnion } from "../types/unions";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  cancelUnionDeletion,
  completeUnionDeletion,
  failUnionDeletion,
  getUnionDeletionTargetId,
  openUnionDeletion,
  type UnionDeletionState,
} from "../utils/unionDeletionFlow";
import {
  pessoalDangerButtonClassName,
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";
import {
  buildPessoalUnionFormPayload,
  buildPessoalUnionFormValues,
  formatPessoalUnionCnpjInput,
} from "./pessoalFormValueHelpers";

const UNIONS_PAGE_SIZE = 20;

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

export function PessoalUnionsSection({ canEdit }: PessoalUnionsSectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);
  const isSearchPending = searchTerm.trim() !== debouncedSearch;
  const unionsQuery = usePaginatedPessoalUnions({
    search: debouncedSearch,
    page,
    limit: UNIONS_PAGE_SIZE,
  });
  const createMutation = useCreatePessoalUnionMutation();
  const deleteMutation = useDeletePessoalUnionMutation();
  const [selectedUnion, setSelectedUnion] = useState<PessoalUnion | null>(null);
  const [unionDeletion, setUnionDeletion] = useState<UnionDeletionState | null>(null);
  const updateMutation = useUpdatePessoalUnionMutation(selectedUnion?.id ?? "");
  const [formValues, setFormValues] = useState<UnionFormValues>(emptyUnionFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const unions = isSearchPending ? [] : unionsQuery.data?.data ?? [];
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    const result = unionsQuery.data;
    if (result && result.data.length === 0 && result.total > 0 && page > 1) {
      setPage(getLastPage(result.total, UNIONS_PAGE_SIZE));
    }
  }, [page, unionsQuery.data]);

  function handleStartCreate() {
    setSelectedUnion(null);
    setFormValues(emptyUnionFormValues);
    setFormError(null);
    setIsFormOpen(true);
  }

  function handleStartEdit(union: PessoalUnion) {
    setSelectedUnion(union);
    setFormValues(buildUnionFormValues(union));
    setFormError(null);
    setIsFormOpen(true);
  }

  function handleCloseForm() {
    setIsFormOpen(false);
    setFormError(null);
  }

  function handleOpenDeleteDialog(union: PessoalUnion) {
    setUnionDeletion((current) =>
      openUnionDeletion(current, union, { canEdit, isPending: deleteMutation.isPending }),
    );
  }

  function handleDeleteDialogOpenChange(open: boolean) {
    if (!open) {
      setUnionDeletion((current) => cancelUnionDeletion(current, deleteMutation.isPending));
    }
  }

  async function handleConfirmDelete() {
    const unionId = getUnionDeletionTargetId(unionDeletion);

    if (!canEdit || !unionId) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(unionId);

      if (selectedUnion?.id === unionId) {
        setSelectedUnion(null);
        setIsFormOpen(false);
      }

      setUnionDeletion((current) => completeUnionDeletion(current, unionId));
      toast.success("Sindicato removido.");
    } catch (error) {
      const message = getPessoalErrorMessage(error, "Não foi possível remover o sindicato.");
      setUnionDeletion((current) => failUnionDeletion(current, unionId, message));
      toast.error(message);
    }
  }

  function handleFieldChange(field: keyof UnionFormValues, value: string) {
    setFormValues((current) => ({
      ...current,
      [field]: field === "cnpj" ? formatPessoalUnionCnpjInput(value) : value,
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
      setIsFormOpen(false);
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível salvar o sindicato."));
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Sindicatos
              </h2>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Cadastros usados na folha e nas rotinas de data-base.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={handleStartCreate}
                className={pessoalPrimaryButtonClassName}
              >
                <Plus className="h-4 w-4" />
                Criar sindicato
              </button>
            ) : null}
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
        </div>

        <div className="mt-5 space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              className={`${pessoalTextFieldClassName} pl-10`}
              placeholder="Buscar por nome ou CNPJ"
              aria-label="Buscar sindicatos"
            />
          </label>

          {unionsQuery.isLoading || isSearchPending ? (
            <StateMessage icon={Loader2} title="Carregando sindicatos" tone="loading">
              Buscando os cadastros disponíveis para esta organização.
            </StateMessage>
          ) : null}

          {unionsQuery.isError ? (
            <StateMessage icon={AlertCircle} title="Não foi possível carregar" tone="danger">
              {getPessoalErrorMessage(unionsQuery.error, "Falha ao carregar sindicatos.")}
            </StateMessage>
          ) : null}

          {!unionsQuery.isLoading && !isSearchPending && !unionsQuery.isError && unions.length === 0 ? (
            <StateMessage icon={Landmark} title="Nenhum sindicato cadastrado">
              {canEdit
                ? "Use o botão Criar sindicato para criar o primeiro cadastro."
                : "Não há sindicatos cadastrados para esta organização."}
            </StateMessage>
          ) : null}

          {!unionsQuery.isLoading && !isSearchPending && !unionsQuery.isError && unions.length > 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full min-w-[720px] border-separate border-spacing-y-2 px-2 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-700 dark:bg-gray-700/50 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">CNPJ</th>
                    <th className="px-4 py-3">Data-base</th>
                    {canEdit ? <th className="px-4 py-3 text-right">Ação</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {unions.map((union) => (
                    <tr
                      key={union.id}
                      className={cn(
                        "bg-white transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700/50",
                        selectedUnion?.id === union.id && "bg-blue-50 dark:bg-blue-900/20",
                      )}
                    >
                      <td className="rounded-l-lg px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {union.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatCPF_CNPJ(union.cnpj) || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatUnionDate(union.base_date)}
                      </td>
                      {canEdit ? (
                        <td className="rounded-r-lg px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(union)}
                              disabled={deleteMutation.isPending}
                              className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-950/30"
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteDialog(union)}
                              disabled={deleteMutation.isPending}
                              className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remover
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <PaginationControls
                page={page}
                limit={UNIONS_PAGE_SIZE}
                total={unionsQuery.data?.total ?? 0}
                count={unions.length}
                hasMore={unionsQuery.data?.hasMore ?? false}
                isFetching={unionsQuery.isFetching || isSearchPending}
                onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                onNext={() => setPage((current) => current + 1)}
              />
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={Boolean(unionDeletion)}
        onOpenChange={handleDeleteDialogOpenChange}
        title="Remover sindicato"
        description="Confirmação de remoção de sindicato"
        contentClassName="w-[min(92vw,520px)]"
        bodyClassName="space-y-3"
        footer={
          <>
            <button
              type="button"
              onClick={() =>
                setUnionDeletion((current) =>
                  cancelUnionDeletion(current, deleteMutation.isPending),
                )
              }
              disabled={deleteMutation.isPending}
              className={pessoalSecondaryButtonClassName}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className={pessoalDangerButtonClassName}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Confirmar remoção
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-slate-300">
          Esta ação remove o sindicato selecionado. Se ele estiver vinculado a uma configuração de
          folha, a remoção será bloqueada até que o vínculo seja alterado.
        </p>
        {unionDeletion ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 dark:bg-gray-900/30 dark:text-gray-200">
            {unionDeletion.union.name} ·{" "}
            {formatCPF_CNPJ(unionDeletion.union.cnpj) || unionDeletion.union.cnpj}
          </p>
        ) : null}
        {unionDeletion?.error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {unionDeletion.error}
          </p>
        ) : null}
      </Dialog>

      {isFormOpen && canEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pessoal-union-form-title"
            className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    id="pessoal-union-form-title"
                    className="text-base font-semibold text-gray-900 dark:text-white"
                  >
                    {selectedUnion ? "Editar sindicato" : "Novo sindicato"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Informe os dados do sindicato.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  disabled={isSubmitting}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Fechar cadastro"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {unionFields.map((field) => (
                <label
                  key={field.name}
                  className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300"
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
                className={`${pessoalPrimaryButtonClassName} w-full`}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : selectedUnion ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {selectedUnion ? "Salvar alterações" : "Criar sindicato"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
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
          "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100",
        tone === "neutral" &&
          "border-dashed border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
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
