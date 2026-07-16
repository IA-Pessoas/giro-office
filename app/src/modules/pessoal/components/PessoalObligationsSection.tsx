import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CheckSquare, Loader2, PlusCircle, RefreshCw, Save } from "lucide-react";

import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreatePessoalObligationMutation,
  useGeneratePessoalObligationsMutation,
  usePessoalObligation,
  useUpdatePessoalObligationMutation,
} from "../hooks/usePessoalObligations";
import type { PessoalObligationUpdatePayload } from "../types/obligations";
import {
  pessoalCheckboxCardClassName,
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";
import { optional } from "./pessoalFormValueHelpers";
import { PessoalPlaceholderSection } from "./PessoalPlaceholderSection";

interface PessoalObligationsSectionProps {
  selectedClientId: string;
  canEdit: boolean;
}

const booleanFields = [
  { name: "advance", label: "Adiantamento" },
  { name: "payroll", label: "Folha" },
  { name: "charges", label: "Encargos" },
  { name: "assistance_fee", label: "Contribuição assistencial" },
  { name: "bem_mais", label: "Bem Mais" },
  { name: "bsf", label: "BSF" },
  { name: "va", label: "Vale-alimentação" },
  { name: "vt", label: "Vale-transporte" },
] as const;

type BooleanFieldName = (typeof booleanFields)[number]["name"];

function currentCompetence() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

export function PessoalObligationsSection({
  selectedClientId,
  canEdit,
}: PessoalObligationsSectionProps) {
  const hasClient = selectedClientId.length > 0;
  const [competence, setCompetence] = useState(currentCompetence);
  const obligationQuery = usePessoalObligation(selectedClientId, competence, hasClient);
  const createMutation = useCreatePessoalObligationMutation();
  const generateMutation = useGeneratePessoalObligationsMutation(competence);
  const obligation = obligationQuery.data ?? null;
  const updateMutation = useUpdatePessoalObligationMutation(
    obligation?.id ?? "",
    selectedClientId,
    competence,
  );
  const [responsibleId, setResponsibleId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutating =
    createMutation.isPending || updateMutation.isPending || generateMutation.isPending;
  const isFormDisabled = !canEdit || obligationQuery.isLoading || isMutating;

  function clearSuccessTimeout() {
    if (successTimeoutRef.current !== null) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  }

  function showTemporarySuccess(message: string) {
    clearSuccessTimeout();
    setSuccessMessage(message);
    successTimeoutRef.current = setTimeout(() => {
      setSuccessMessage(null);
      successTimeoutRef.current = null;
    }, 3000);
  }

  useEffect(() => {
    clearSuccessTimeout();
    setResponsibleId(obligation?.responsavel_id ?? "");
    setFormError(null);
    setSuccessMessage(null);
  }, [obligation?.id, obligation?.responsavel_id, selectedClientId, competence]);

  useEffect(() => {
    return () => clearSuccessTimeout();
  }, []);

  if (!hasClient) {
    return (
      <PessoalPlaceholderSection
        icon={CheckSquare}
        title="Obrigações"
        description="Selecione um cliente para continuar."
        requiresClient
        hasClient={false}
      />
    );
  }

  async function handleCreate() {
    if (!canEdit) {
      return;
    }

    setFormError(null);
    clearSuccessTimeout();
    setSuccessMessage(null);

    try {
      const result = await createMutation.mutateAsync({
        client_id: selectedClientId,
        competence,
      });

      showTemporarySuccess(result.created ? "Obrigação criada." : "Obrigação já existia.");
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível criar a obrigação."));
    }
  }

  async function handleGenerate() {
    if (!canEdit) {
      return;
    }

    setFormError(null);
    clearSuccessTimeout();
    setSuccessMessage(null);

    try {
      const result = await generateMutation.mutateAsync();

      showTemporarySuccess(
        [
          `Geração concluída: ${result.created} criadas`,
          `${result.skippedExisting} existentes`,
          `${result.skippedNoPayroll} sem folha.`,
        ].join(", "),
      );
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível gerar as obrigações."));
    }
  }

  async function updateField(payload: PessoalObligationUpdatePayload) {
    if (!canEdit || !obligation) {
      return;
    }

    setFormError(null);
    clearSuccessTimeout();
    setSuccessMessage(null);

    try {
      await updateMutation.mutateAsync(payload);
      showTemporarySuccess("Obrigação atualizada.");
    } catch (error) {
      setFormError(getPessoalErrorMessage(error, "Não foi possível atualizar a obrigação."));
    }
  }

  function handleBooleanChange(field: BooleanFieldName, checked: boolean) {
    void updateField({ [field]: checked } as PessoalObligationUpdatePayload);
  }

  function handleResponsibleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void updateField({ responsavel_id: optional(responsibleId) });
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-6",
        "dark:border-gray-700 dark:bg-gray-800",
      )}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Obrigações
              </h2>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Controle mensal gerado a partir da configuração de folha do cliente.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
              Competência
              <input
                type="month"
                value={competence}
                onChange={(event) => setCompetence(event.target.value)}
                className={pessoalTextFieldClassName}
              />
            </label>
            <button
              type="button"
              onClick={() => obligationQuery.refetch()}
              disabled={obligationQuery.isFetching}
              className={pessoalSecondaryButtonClassName}
            >
              {obligationQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!competence || isMutating}
                  className={pessoalSecondaryButtonClassName}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Gerar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!competence || Boolean(obligation) || isMutating}
                  className={pessoalPrimaryButtonClassName}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="h-4 w-4" />
                  )}
                  Criar
                </button>
              </>
            ) : null}
          </div>
        </div>

        {obligationQuery.isLoading ? (
          <StateMessage icon={Loader2} title="Carregando obrigação" tone="loading">
            Buscando a competência selecionada.
          </StateMessage>
        ) : null}

        {obligationQuery.isError ? (
          <StateMessage icon={AlertCircle} title="Não foi possível carregar" tone="danger">
            {getPessoalErrorMessage(obligationQuery.error, "Falha ao carregar obrigação.")}
          </StateMessage>
        ) : null}

        {!obligationQuery.isLoading && !obligationQuery.isError && !obligation ? (
          <StateMessage icon={CheckSquare} title="Obrigação não cadastrada">
            Nenhuma obrigação cadastrada para este cliente nesta competência.
          </StateMessage>
        ) : null}

        {obligation ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {booleanFields.map((field) => (
                <label key={field.name} className={pessoalCheckboxCardClassName}>
                  <input
                    type="checkbox"
                    checked={obligation[field.name] === true}
                    onChange={(event) => handleBooleanChange(field.name, event.target.checked)}
                    disabled={isFormDisabled}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {field.label}
                </label>
              ))}
            </div>

            <form
              onSubmit={handleResponsibleSubmit}
              className="grid gap-3 md:grid-cols-[1fr_auto]"
            >
              <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                Responsável ID
                <input
                  type="text"
                  value={responsibleId}
                  onChange={(event) => setResponsibleId(event.target.value)}
                  disabled={isFormDisabled}
                  className={pessoalTextFieldClassName}
                />
              </label>
              {canEdit ? (
                <button
                  type="submit"
                  disabled={isFormDisabled}
                  className={`${pessoalSecondaryButtonClassName} self-end`}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar responsável
                </button>
              ) : null}
            </form>
          </>
        ) : null}

        {formError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {formError}
          </p>
        ) : null}

        {successMessage ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{successMessage}</p>
        ) : null}
      </div>
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
          cn(
            "border-red-200 bg-red-50 text-red-800",
            "dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100",
          ),
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
