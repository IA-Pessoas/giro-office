import type { ReportBuilderState, ReportsCatalogRelation, ReportsCatalogSource, ReportJoinType } from "../types/report.types";
import { ReportSelect, ReportStep, reportMutedClassName } from "./ReportStep";

export function ReportRelationStep({
  source,
  relation,
  onRelationChange,
}: {
  source: ReportsCatalogSource;
  relation: ReportBuilderState["relation"];
  onRelationChange: (relation: ReportBuilderState["relation"]) => void;
}) {
  const relations = source.relations ?? [];
  const selectedDescriptor = relations.find((candidate) => candidate.key === relation?.key);

  function joinTypesFor(descriptor: ReportsCatalogRelation) {
    return descriptor.joinTypes ?? descriptor.capabilities?.joinTypes ?? [];
  }

  function selectRelation(key: string) {
    if (!key) {
      onRelationChange(undefined);
      return;
    }
    const descriptor = relations.find((candidate) => candidate.key === key);
    const joinType = descriptor && joinTypesFor(descriptor)[0];
    onRelationChange(descriptor && joinType ? { key, joinType } : undefined);
  }

  return (
    <ReportStep
      title="2. Relação"
      description="Adicione uma relação somente quando ela estiver publicada para esta fonte."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-800 dark:text-slate-200" htmlFor="report-relation">
            Relação opcional
          </label>
          <ReportSelect
            id="report-relation"
            value={relation?.key ?? ""}
            onChange={(event) => selectRelation(event.currentTarget.value)}
          >
            <option value="">Sem relação</option>
            {relations.map((candidate) => (
              <option key={candidate.key} value={candidate.key} disabled={joinTypesFor(candidate).length === 0}>
                {candidate.label}
                {joinTypesFor(candidate).length === 0 ? " — indisponível" : ""}
              </option>
            ))}
          </ReportSelect>
        </div>

        <div className="space-y-3">
          <span className="block text-sm font-medium text-gray-800 dark:text-slate-200">Tipo de junção</span>
          <div className="flex gap-2" role="group" aria-label="Tipo de junção">
            {(["inner", "left"] as const).map((joinType: ReportJoinType) => {
              const allowed = selectedDescriptor ? joinTypesFor(selectedDescriptor).includes(joinType) : false;
              return (
                <button
                  key={joinType}
                  type="button"
                  disabled={!selectedDescriptor || !allowed}
                  aria-pressed={relation?.joinType === joinType}
                  title={allowed ? undefined : "Esta capacidade não foi publicada para a relação selecionada."}
                  onClick={() => selectedDescriptor && onRelationChange({ key: selectedDescriptor.key, joinType })}
                  className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
                    relation?.joinType === joinType
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {joinType === "inner" ? "Inner" : "Left"}
                </button>
              );
            })}
          </div>
          <p className={reportMutedClassName}>
            {!selectedDescriptor
              ? "Sem relação, a prévia consulta apenas a fonte principal."
              : "Opções não publicadas ficam desabilitadas por regra de negócio."}
          </p>
        </div>
      </div>
    </ReportStep>
  );
}
