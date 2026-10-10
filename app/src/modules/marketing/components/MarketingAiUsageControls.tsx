import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useFetch } from "@shared/hooks";
import { useModuleAccess } from "@modules/auth";
import { useMarketingDashboard } from "../hooks/useMarketingDashboard";
import { marketingQueryKey } from "../utils/marketingQueryKeys";
import { aiUsageUserName } from "../utils/marketingCsv";
import { AI_USAGE_REPORT_SECTIONS, MarketingAiUsageReport } from "./MarketingAiUsageReport";

import { marketingAiUsageService, type AiUsageAnswers, type AiUsageControl } from "../services/marketingAiUsageService";

// Tela: pendências (qualquer resposta ausente) mais as duas listas legadas do relatório.
const AI_USAGE_SCREEN_LISTS = [
  { key: "pending", title: "Respostas pendentes" },
  ...AI_USAGE_REPORT_SECTIONS,
] as const;

function currentCompetence(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function AnswerForm({ control, onSave, saving, editable }: {
  control: AiUsageControl;
  onSave: (answers: AiUsageAnswers) => void;
  saving: boolean;
  editable: boolean;
}) {
  const [knowledge, setKnowledge] = useState(control.knowledge === null ? "" : String(control.knowledge));
  const [integration, setIntegration] = useState(control.integration === null ? "" : String(control.integration));
  const [frequency, setFrequency] = useState(control.frequency?.toString() ?? "");
  const [purpose, setPurpose] = useState(control.purpose ?? "");
  const [perceivedGain, setPerceivedGain] = useState(control.perceived_gain ?? "");

  return (
    <form
      className="grid gap-3 border-t border-gray-100 pt-4 dark:border-slate-700 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          knowledge: knowledge === "" ? null : knowledge === "true",
          integration: integration === "" ? null : integration === "true",
          frequency: frequency === "" ? null : Number(frequency),
          purpose: purpose.trim() || null,
          perceived_gain: perceivedGain.trim() || null,
        });
      }}
    >
      <label className="text-sm text-gray-700 dark:text-slate-200">
        Conhece o ChatGPT?
        <select disabled={!editable} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={knowledge} onChange={(event) => setKnowledge(event.target.value)}>
          <option value="">Sem resposta</option><option value="true">Sim</option><option value="false">Não</option>
        </select>
      </label>
      <label className="text-sm text-gray-700 dark:text-slate-200">
        Integração com IA?
        <select disabled={!editable} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={integration} onChange={(event) => setIntegration(event.target.value)}>
          <option value="">Sem resposta</option><option value="true">Sim</option><option value="false">Não</option>
        </select>
      </label>
      <label className="text-sm text-gray-700 dark:text-slate-200">
        Frequência de uso (1 a 10)
        <input disabled={!editable} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" type="number" min={1} max={10} value={frequency} onChange={(event) => setFrequency(event.target.value)} />
      </label>
      <label className="text-sm text-gray-700 dark:text-slate-200">
        Finalidade
        <textarea disabled={!editable} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" maxLength={5000} rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
      </label>
      <label className="text-sm text-gray-700 dark:text-slate-200 md:col-span-2">
        Ganho percebido
        <textarea disabled={!editable} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" maxLength={5000} rows={2} value={perceivedGain} onChange={(event) => setPerceivedGain(event.target.value)} />
      </label>
      {editable ? <div className="md:col-span-2">
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} type="submit">
          {saving ? "Salvando…" : "Salvar respostas"}
        </button>
      </div> : null}
    </form>
  );
}

export function MarketingAiUsageControls() {
  const { access, user } = useModuleAccess("marketing");
  const canEdit = access.canEdit;
  const dashboardQuery = useMarketingDashboard();
  const [selectedCompetence, setSelectedCompetence] = useState<string | null>(null);
  const competence = selectedCompetence ?? dashboardQuery.data?.aiUsage.competence ?? currentCompetence();
  const [userId, setUserId] = useState("");
  const [legacyJson, setLegacyJson] = useState("[]");
  const [importError, setImportError] = useState("");
  const queryClient = useQueryClient();
  const queryKey = marketingQueryKey(["marketing", "ai-usage", competence], user);
  const usersQueryKey = marketingQueryKey(["marketing", "ai-usage-users"], user);
  const reportQueryKey = marketingQueryKey(
    ["marketing", "ai-usage-report", competence],
    user,
  );
  const reconciliationQueryKey = marketingQueryKey(
    ["marketing", "ai-usage-reconciliation"],
    user,
  );
  const controlsQuery = useFetch(queryKey, () => marketingAiUsageService.getControls(competence));
  const usersQuery = useFetch(
    usersQueryKey,
    () => marketingAiUsageService.getEligibleUsers(),
  );
  const reportQuery = useFetch(
    reportQueryKey,
    () => marketingAiUsageService.getReport(competence),
  );
  const reconciliationQuery = useFetch(
    reconciliationQueryKey,
    () => marketingAiUsageService.getReconciliation(),
  );

  useEffect(() => {
    setUserId("");
    setLegacyJson("[]");
    setImportError("");
  }, [user?.id, user?.organization_id]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: reportQueryKey }),
      queryClient.invalidateQueries({
        queryKey: marketingQueryKey(["marketing", "dashboard"], user),
      }),
      queryClient.invalidateQueries({ queryKey: reconciliationQueryKey }),
    ]);
  };
  const createBatch = useMutation({ mutationFn: () => marketingAiUsageService.createBatch(competence), onSuccess: refresh });
  const createOne = useMutation({ mutationFn: () => marketingAiUsageService.createOne(userId, competence), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, answers }: { id: string; answers: AiUsageAnswers }) => marketingAiUsageService.update(id, answers), onSuccess: refresh });
  const importLegacy = useMutation({ mutationFn: (records: Array<Record<string, unknown>>) => marketingAiUsageService.importLegacy(records), onSuccess: refresh });

  return (
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pesquisas mensais de uso de IA</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Registre respostas sobre conhecimento, integração, frequência, finalidade e ganho percebido.</p>
        </div>
        <label className="text-sm text-gray-700 dark:text-slate-200">
          Competência
          <input className="ml-2 rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" type="month" value={competence} onChange={(event) => setSelectedCompetence(event.target.value)} />
        </label>
      </div>

      {canEdit ? <div className="flex flex-wrap items-end gap-3">
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={createBatch.isPending} onClick={() => createBatch.mutate()} type="button">
          Criar para usuários ativos
        </button>
        <label className="text-sm text-gray-700 dark:text-slate-200">
          Criar para uma pessoa
          <select className="mt-1 block min-w-64 rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Selecione um usuário</option>
            {(usersQuery.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.full_name || user.name}</option>)}
          </select>
        </label>
        <button className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200" disabled={!userId || createOne.isPending} onClick={() => createOne.mutate()} type="button">
          Criar pesquisa
        </button>
      </div> : null}

      {createBatch.isError || createOne.isError || update.isError ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">Não foi possível salvar. Verifique a permissão ou tente novamente.</p> : null}
      {createBatch.isSuccess ? <p className="text-sm text-green-700 dark:text-green-300" role="status">Pesquisas criadas: {createBatch.data.created}; já existentes: {createBatch.data.alreadyExisted}.</p> : null}
      {importLegacy.isSuccess ? <p className="text-sm text-green-700 dark:text-green-300" role="status">Importados: {importLegacy.data.imported}; já existentes: {importLegacy.data.alreadyExisted}; enviados à reconciliação: {importLegacy.data.reconciliation}.</p> : null}
      {canEdit ? <div className="space-y-2 rounded-lg border border-gray-200 p-4 dark:border-slate-700">
        <label className="block text-sm font-medium text-gray-800 dark:text-slate-100" htmlFor="marketing-ai-legacy-json">Importar registros legados (JSON)</label>
        <textarea id="marketing-ai-legacy-json" className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-900" rows={4} value={legacyJson} onChange={(event) => setLegacyJson(event.target.value)} aria-describedby="marketing-ai-import-format" />
        <p className="text-xs text-gray-500 dark:text-slate-400" id="marketing-ai-import-format">Cole um array de registros com legacyUserId, competence e as respostas legadas. Associações incertas ficam na fila de reconciliação.</p>
        {importError ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">{importError}</p> : null}
        <button className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200" disabled={importLegacy.isPending} onClick={() => {
          try {
            const records: unknown = JSON.parse(legacyJson);
            if (!Array.isArray(records) || records.length === 0 || records.length > 1000 || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
              throw new Error("Informe um array com 1 a 1.000 registros JSON.");
            }
            setImportError("");
            importLegacy.mutate(records as Array<Record<string, unknown>>);
          } catch (error) {
            setImportError(error instanceof Error ? error.message : "JSON inválido.");
          }
        }} type="button">Importar e reconciliar</button>
      </div> : null}
      {controlsQuery.isLoading ? <p className="text-sm text-gray-500 dark:text-slate-400">Carregando pesquisas…</p> : null}
      {controlsQuery.isError ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">Não foi possível carregar as pesquisas.</p> : null}
      <div className="space-y-4">
        {(controlsQuery.data ?? []).map((control) => (
          <article className="rounded-lg border border-gray-200 p-4 dark:border-slate-700" key={control.id}>
            <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">{aiUsageUserName(control)}</h3>
            <AnswerForm control={control} saving={update.isPending} editable={canEdit} onSave={(answers) => update.mutate({ id: control.id, answers })} />
          </article>
        ))}
        {!controlsQuery.isLoading && controlsQuery.data?.length === 0 ? <p className="text-sm text-gray-500 dark:text-slate-400">Nenhuma pesquisa criada para esta competência.</p> : null}
      </div>

      <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-slate-700">
        <MarketingAiUsageReport competence={competence} report={reportQuery.data} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {AI_USAGE_SCREEN_LISTS.map((list) => (
          <div key={list.key}>
            <h3 className="font-semibold text-gray-900 dark:text-white">{list.title} ({reportQuery.data?.[list.key].length ?? 0})</h3>
            <ul className="mt-2 list-inside list-disc text-sm text-gray-600 dark:text-slate-300">
              {(reportQuery.data?.[list.key] ?? []).map((control) => <li key={control.id}>{aiUsageUserName(control)}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 pt-4 dark:border-slate-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">Importações pendentes de reconciliação ({reconciliationQuery.data?.length ?? 0})</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-slate-300">
          {(reconciliationQuery.data ?? []).map((record) => <li key={record.id}>Usuário legado {record.legacy_user_id} · {record.legacy_competence} · {record.reason}</li>)}
        </ul>
      </div>
    </section>
  );
}
