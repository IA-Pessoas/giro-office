import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";

import {
  type ContabilCompetence,
  getContabilErrorMessage,
  TriageDocumentsSection,
  useTriageEditability,
} from "@modules/contabil";

import { useTriageNoteCounts } from "../hooks";
import type { TriageNoteCountsInput, TriageSolicitation } from "../services";
import { TRIAGE_FIELD_CLASSNAME, TRIAGE_PRIMARY_BUTTON_CLASSNAME } from "./triagem.styles";

const MAX_NOTE_COUNT = 1_000_000;

const COUNTERS: Array<{ key: keyof TriageNoteCountsInput; label: string }> = [
  { key: "xml_inbound", label: "XML entradas" },
  { key: "xml_outbound", label: "XML saídas" },
  { key: "nfse_issued", label: "NFSE prestadas" },
  { key: "nfse_received", label: "NFSE tomadas" },
];

const EMPTY: Record<keyof TriageNoteCountsInput, string> = {
  xml_inbound: "0",
  xml_outbound: "0",
  nfse_issued: "0",
  nfse_received: "0",
};

export function TriageSolicitationDetail({
  solicitation,
  canEdit,
  canViewFiscal,
  canEditFiscal,
}: {
  solicitation: TriageSolicitation;
  canEdit: boolean;
  canViewFiscal: boolean;
  canEditFiscal: boolean;
}) {
  const { query, update } = useTriageNoteCounts(solicitation);
  const fiscalEditability = useTriageEditability(
    canViewFiscal ? solicitation.client_id : "",
    "FISCAL",
  );
  const [drafts, setDrafts] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const canEditCounts = canEdit && solicitation.status === "OPEN";

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setDrafts(
      Object.fromEntries(COUNTERS.map(({ key }) => [key, String(data[key])])) as typeof EMPTY,
    );
  }, [query.data]);

  async function saveCounts(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const values = Object.fromEntries(
      COUNTERS.map(({ key }) => [key, Number(drafts[key])]),
    ) as TriageNoteCountsInput;
    const invalid = COUNTERS.find(
      ({ key }) => !Number.isInteger(values[key]) || values[key] < 0 || values[key] > MAX_NOTE_COUNT,
    );
    setFormError(
      invalid ? `${invalid.label}: informe um número inteiro entre 0 e 1.000.000.` : null,
    );
    if (invalid) return;
    try {
      await update.mutateAsync(values);
    } catch {
      return; // mensagem da API aparece abaixo do formulário
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <form onSubmit={saveCounts} noValidate aria-label="Contadores de notas">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
          Notas de {solicitation.client.name} em {solicitation.competence}
        </h3>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Os contadores valem para o cliente na competência e são os mesmos em todas as solicitações dela.
        </p>
        {query.isLoading ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando contadores...
          </p>
        ) : (
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            {COUNTERS.map(({ key, label }) => (
              <label key={key} className="text-sm font-medium text-gray-700 dark:text-slate-300">
                {label}
                <input
                  type="number"
                  min={0}
                  max={MAX_NOTE_COUNT}
                  step={1}
                  inputMode="numeric"
                  value={drafts[key]}
                  disabled={!canEditCounts}
                  onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                  className={TRIAGE_FIELD_CLASSNAME}
                />
              </label>
            ))}
          </div>
        )}
        {query.data?.updated_at ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
            Atualizado por {query.data.updated_by?.name || query.data.updated_by?.full_name || "usuário"} em{" "}
            {new Date(query.data.updated_at).toLocaleString("pt-BR")}
          </p>
        ) : null}
        {canEditCounts ? (
          <button
            type="submit"
            disabled={update.isPending || query.isLoading}
            className={`${TRIAGE_PRIMARY_BUTTON_CLASSNAME} mt-3`}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Salvar contadores
          </button>
        ) : null}
        {formError ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
            {formError}
          </p>
        ) : null}
        {query.error || update.error ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300" role="alert">
            Não foi possível carregar ou salvar os contadores. {getContabilErrorMessage(query.error ?? update.error)}
          </p>
        ) : null}
      </form>

      {canViewFiscal ? (
        <TriageDocumentsSection
          key={`${solicitation.client_id}-${solicitation.competence}`}
          clientId={solicitation.client_id}
          fixedCompetence={solicitation.competence as ContabilCompetence}
          canEdit={canEditFiscal && fiscalEditability.data?.can_edit === true}
          canEditClosing={false}
          documentType="FISCAL"
        />
      ) : (
        <p className="text-sm text-gray-600 dark:text-slate-400">
          O checklist Fiscal exige acesso ao módulo Fiscal.
        </p>
      )}
    </div>
  );
}
