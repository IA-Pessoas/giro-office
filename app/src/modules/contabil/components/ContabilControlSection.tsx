import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Lock } from "lucide-react";

import { useContabilControlBootstrapMutation } from "../hooks";
import { getContabilErrorMessage } from "../services";
import type { ContabilCompetence, ContabilControl } from "../types";
import {
  CONTABIL_CONTROL_CHECKLIST_FIELDS,
  CONTABIL_CONTROL_NOTES_FIELD,
} from "./contabilControlFields";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilStateBox } from "./ContabilStateBox";

interface ContabilControlSectionProps {
  clientId: string;
  canEdit: boolean;
}

export function ContabilControlSection({
  clientId,
  canEdit,
}: ContabilControlSectionProps) {
  const bootstrapMutation = useContabilControlBootstrapMutation();
  const [competence, setCompetence] = useState(() => getCurrentContabilCompetence());
  const [control, setControl] = useState<ContabilControl | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const checklistItems = useMemo(
    () =>
      CONTABIL_CONTROL_CHECKLIST_FIELDS.map((fieldDefinition) => ({
        ...fieldDefinition,
        checked: Boolean(control?.[fieldDefinition.field]),
      })),
    [control],
  );

  useEffect(() => {
    if (!clientId) {
      return;
    }

    void bootstrapControl(clientId, competence);
  }, [clientId, competence]);

  async function bootstrapControl(nextClientId: string, nextCompetence: ContabilCompetence) {
    setBootstrapError(null);
    setControl(null);

    try {
      const nextControl = await bootstrapMutation.mutateAsync({
        client_id: nextClientId,
        competence: nextCompetence,
      });

      setControl(nextControl);
    } catch (error) {
      setBootstrapError(getContabilErrorMessage(error));
    }
  }

  function handleCompetenceChange(value: string) {
    setCompetence((value || getCurrentContabilCompetence()) as ContabilCompetence);
  }

  function handleChecklistChange(field: keyof ContabilControl, checked: boolean) {
    if (!control || !canEdit) {
      return;
    }

    setControl((current) =>
      current
        ? {
            ...current,
            [field]: checked,
          }
        : current,
    );
  }

  function handleNotesChange(value: string) {
    if (!control || !canEdit) {
      return;
    }

    setControl((current) =>
      current
        ? {
            ...current,
            notes: value,
          }
        : current,
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Controle mensal contábil
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Acompanhe o checklist operacional da competência e registre observações do
              fechamento.
            </p>
          </div>

          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300">
            <span>Competência</span>
            <input
              type="month"
              value={competence}
              onChange={(event) => handleCompetenceChange(event.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
        </div>
      </div>

      {!canEdit ? (
        <ContabilStateBox icon={Lock} title="Modo visualização" compact>
          Você pode acompanhar o checklist desta competência, mas não tem permissão para
          alterar os campos.
        </ContabilStateBox>
      ) : null}

      {bootstrapMutation.isPending && !control ? (
        <ContabilStateBox icon={Loader2} tone="loading" title="Carregando controle" compact>
          Estamos preparando o checklist mensal desta competência.
        </ContabilStateBox>
      ) : null}

      {bootstrapError && !control ? (
        <ContabilStateBox
          icon={AlertCircle}
          tone="danger"
          title="Não foi possível carregar o controle"
          compact
        >
          {bootstrapError}
        </ContabilStateBox>
      ) : null}

      {!bootstrapMutation.isPending && !bootstrapError && !control ? (
        <ContabilStateBox icon={AlertCircle} title="Controle indisponível" compact>
          O backend não retornou um controle válido para esta competência.
        </ContabilStateBox>
      ) : null}

      {control ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Checklist operacional
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  Marque cada atividade concluída ao longo do fechamento da competência.
                </p>
              </div>

              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                {competence}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {checklistItems.map((item) => (
                <label
                  key={item.field}
                  className={`rounded-xl border p-3 transition-colors ${
                    item.checked
                      ? "border-blue-200 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-900/10"
                      : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                  } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) =>
                        handleChecklistChange(item.field, event.target.checked)
                      }
                      disabled={!canEdit}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.label}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {CONTABIL_CONTROL_NOTES_FIELD ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {CONTABIL_CONTROL_NOTES_FIELD.label}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  Registre observações complementares desta competência.
                </p>
              </div>

              <div className="mt-4">
                <textarea
                  value={control.notes ?? ""}
                  onChange={(event) => handleNotesChange(event.target.value)}
                  disabled={!canEdit}
                  rows={4}
                  placeholder="Adicione observações do fechamento, pendências ou contexto relevante."
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
