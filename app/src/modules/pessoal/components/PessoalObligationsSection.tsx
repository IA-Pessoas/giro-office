import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckSquare,
  ChevronDown,
  Loader2,
  PlusCircle,
  RefreshCw,
  Save,
} from "lucide-react";

import { useAssignableUsers } from "@modules/rh";
import { cn } from "@shared/ui/newLayout/utils";
import { FieldHelp } from "@shared/ui/newLayout/field-help";

import {
  useCreatePessoalObligationMutation,
  useGeneratePessoalObligationsMutation,
  usePessoalObligation,
  useUpdatePessoalObligationMutation,
} from "../hooks/usePessoalObligations";
import {
  PESSOAL_OBLIGATION_ITEMS,
  type PessoalObligationItem,
  type PessoalObligationUpdatePayload,
} from "../types/obligations";
import { formatPessoalObligationGenerationSummary } from "../utils/obligationGenerationSummary";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalCheckboxCardClassName,
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";
import { optional } from "./pessoalFormValueHelpers";
import { PessoalObligationHistory } from "./PessoalObligationHistory";
import { PessoalObligationPortfolio } from "./PessoalObligationPortfolio";
import { PessoalPlaceholderSection } from "./PessoalPlaceholderSection";

interface PessoalObligationsSectionProps {
  selectedClientId: string;
  canEdit: boolean;
}

const booleanFieldHelp: Partial<Record<PessoalObligationItem, string>> = {
  assistance_fee: "Indica se há cobrança de contribuição assistencial para a obrigação.",
  bsf: "Indica se a rotina BSF deve ser considerada nesta obrigação.",
};

const booleanFields = PESSOAL_OBLIGATION_ITEMS.map((item) => ({
  ...item,
  help: booleanFieldHelp[item.name],
}));

type BooleanFieldName = PessoalObligationItem;

function currentCompetence() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
  const updateMutation = useUpdatePessoalObligationMutation(obligation?.id ?? "");
  const responsibleUsersQuery = useAssignableUsers({
    enabled: canEdit && Boolean(obligation),
    module: "pessoal",
  });
  const [responsibleId, setResponsibleId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutating =
    createMutation.isPending || updateMutation.isPending || generateMutation.isPending;
  const isFormDisabled = !canEdit || obligationQuery.isLoading || isMutating;
  const responsibleUsers = responsibleUsersQuery.data ?? [];
  const hasSelectedResponsible = responsibleUsers.some((user) => user.id === responsibleId);
  const areResponsibleOptionsLoading =
    responsibleUsersQuery.isLoading;
  const hasResponsibleOptionsError =
    responsibleUsersQuery.isError;

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

  async function handleCreate() {
    if (!canEdit || !hasClient) {
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

      showTemporarySuccess(formatPessoalObligationGenerationSummary(result));
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

  function getResponsiblePlaceholder() {
    if (areResponsibleOptionsLoading) {
      return "Carregando responsáveis";
    }

    if (hasResponsibleOptionsError) {
      return "Responsáveis indisponíveis";
    }

    return "Sem responsável";
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
              A geração em massa avalia todos os clientes ativos de Departamento Pessoal.
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
            {hasClient ? (
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
            ) : null}
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
                  Gerar todos
                </button>
                {hasClient ? (
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
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {!hasClient ? (
          <PessoalPlaceholderSection
            icon={CheckSquare}
            title="Obrigação individual"
            description="Selecione um cliente para consultar ou editar a obrigação individual."
            requiresClient
            hasClient={false}
          />
        ) : null}

        {hasClient && obligationQuery.isLoading ? (
          <StateMessage icon={Loader2} title="Carregando obrigação" tone="loading">
            Buscando a competência selecionada.
          </StateMessage>
        ) : null}

        {hasClient && obligationQuery.isError ? (
          <StateMessage icon={AlertCircle} title="Não foi possível carregar" tone="danger">
            {getPessoalErrorMessage(obligationQuery.error, "Falha ao carregar obrigação.")}
          </StateMessage>
        ) : null}

        {hasClient && !obligationQuery.isLoading && !obligationQuery.isError && !obligation ? (
          <StateMessage icon={CheckSquare} title="Obrigação não cadastrada">
            Nenhuma obrigação cadastrada para este cliente nesta competência.
          </StateMessage>
        ) : null}

        {obligation ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {booleanFields.map((field) => {
                const helpText = field.help;

                return (
                  <label key={field.name} className={pessoalCheckboxCardClassName}>
                    <input
                      type="checkbox"
                      checked={obligation[field.name] === true}
                      onChange={(event) => handleBooleanChange(field.name, event.target.checked)}
                      disabled={isFormDisabled}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="inline-flex items-center gap-1">
                      <span>{field.label}</span>
                      {helpText ? <FieldHelp label={field.label} description={helpText} /> : null}
                    </span>
                  </label>
                );
              })}
            </div>

            <form
              onSubmit={handleResponsibleSubmit}
              className="grid gap-3 md:grid-cols-[1fr_auto]"
            >
              <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                Responsável
                <div className="relative">
                  <select
                    value={responsibleId}
                    onChange={(event) => setResponsibleId(event.target.value)}
                    disabled={
                      isFormDisabled ||
                      areResponsibleOptionsLoading ||
                      hasResponsibleOptionsError
                    }
                    className={`${pessoalTextFieldClassName} appearance-none pr-12`}
                  >
                    <option value="">{getResponsiblePlaceholder()}</option>
                    {responsibleId && !hasSelectedResponsible ? (
                      <option value={responsibleId}>Responsável atual</option>
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

            <PessoalObligationHistory key={obligation.id} obligationId={obligation.id} />
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

        <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
          <PessoalObligationPortfolio competence={competence} canEdit={canEdit} />
        </div>
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
