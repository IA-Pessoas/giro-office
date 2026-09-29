import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, RefreshCw } from "lucide-react";
import { useState } from "react";

import { platformService, type MarketingReconciliationDataset } from "../services/platformService";
import type { PlatformOrganization } from "../types";

const DATASET_LABELS: Record<MarketingReconciliationDataset, string> = {
  eventos: "Eventos",
  eventos_edicoes: "Edições de eventos",
  eventos_feedbacks_periodos: "Períodos de avaliação",
  eventos_feedbacks: "Avaliações",
  redes_sociais: "Redes sociais",
  senhas: "Credenciais",
  ai_usage: "Uso de IA",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function itemKey(item: { sourceIdentityDigest: string; stepId: string }): string {
  return `${item.sourceIdentityDigest}:${item.stepId}`;
}

export function MarketingMigrationReconciliationTab({
  organization,
}: {
  organization: PlatformOrganization;
}) {
  const queryClient = useQueryClient();
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});
  const queryKey = ["platform", "marketing-migration-reconciliation", organization.id];
  const reconciliationQuery = useQuery({
    queryKey,
    queryFn: () => platformService.getMarketingMigrationReconciliation(organization.id),
  });
  const targetsQuery = useQuery({
    queryKey: ["platform", "marketing-canonical-events", organization.id],
    queryFn: () => platformService.listMarketingCanonicalEvents(organization.id),
    enabled: reconciliationQuery.data?.datasets.some((dataset) =>
      (dataset.items.some(
        (item) =>
          dataset.dataset === "eventos_edicoes" &&
          item.reasonCode === "MKT_EDITION_EVENT_AMBIGUOUS" &&
          item.resolution === null,
      ) || dataset.decisions.length > 0),
    ) === true,
  });

  const resolveMutation = useMutation({
    mutationFn: (input: {
      sourceIdentityDigest: string;
      stepId: string;
      canonicalTargetId: string;
    }) =>
      platformService.resolveMarketingMigrationAssociation("eventos_edicoes", {
        organizationId: organization.id,
        sourceTable: "tb_mkt.eventos_edicoes",
        ...input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const reconcileMutation = useMutation({
    mutationFn: () =>
      platformService.reconcileMarketingMigration("eventos_edicoes", organization.id),
    onSuccess: async () => {
      setSelectedTargets({});
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  if (reconciliationQuery.isLoading) {
    return (
      <div className="p-5 text-sm text-slate-600 dark:text-slate-300" role="status">
        Carregando reconciliação de Marketing…
      </div>
    );
  }
  if (reconciliationQuery.isError || !reconciliationQuery.data) {
    return (
      <div className="m-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">
        <p>Não foi possível carregar a reconciliação de Marketing desta organização.</p>
        <button
          className="mt-3 font-semibold underline underline-offset-4"
          onClick={() => void reconciliationQuery.refetch()}
          type="button"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { datasets, lastRunAt } = reconciliationQuery.data;
  const canonicalEvents = targetsQuery.data ?? [];

  return (
    <section aria-label={`Reconciliação de Marketing para ${organization.name}`} className="space-y-5 p-4 sm:p-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            Reconciliação da migração de Marketing
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            Totais e pendências da origem V4 para {organization.name}. A origem é consultada em modo somente leitura.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Última execução: {lastRunAt ? formatDate(lastRunAt) : "não executada"}
          </p>
        </div>
        <button
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={reconcileMutation.isPending}
          onClick={() => reconcileMutation.mutate()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${reconcileMutation.isPending ? "animate-spin" : ""}`} />
          {reconcileMutation.isPending ? "Executando…" : "Reexecutar reconciliação"}
        </button>
      </header>

      {reconcileMutation.isError && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Origem indisponível ou execução incompleta. O gate de Marketing continua fechado.
        </p>
      )}
      {resolveMutation.isError && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">
          A resolução não foi registrada. Atualize a lista e tente novamente.
        </p>
      )}
      {reconcileMutation.isSuccess && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">
          Nova execução registrada. Confira os totais e as pendências atualizados abaixo.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {datasets.map((dataset) => (
          <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700" key={dataset.dataset}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {DATASET_LABELS[dataset.dataset]}
              </h3>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${dataset.status === "completed" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                {dataset.status === "completed" ? "Executado" : "Não executado"}
              </span>
            </div>
            {dataset.totals ? (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-slate-500 dark:text-slate-400">Preparados</dt><dd className="mt-1 font-semibold tabular-nums">{dataset.totals.prepared}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Importados</dt><dd className="mt-1 font-semibold tabular-nums">{dataset.totals.imported}</dd></div>
                <div><dt className="text-slate-500 dark:text-slate-400">Quarentena</dt><dd className="mt-1 font-semibold tabular-nums">{dataset.totals.quarantined}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Totais indisponíveis até a execução válida da fonte.</p>
            )}
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
              {dataset.items.length} pendência(s) detalhada(s)
            </p>
          </article>
        ))}
      </div>

      <section aria-labelledby="marketing-reconciliation-items-heading" className="space-y-3">
        <h3 className="text-base font-semibold text-slate-950 dark:text-white" id="marketing-reconciliation-items-heading">
          Pendências
        </h3>
        {datasets.every((dataset) => dataset.items.length === 0) ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            Nenhum item detalhado. Uma origem ainda não executada não equivale a uma reconciliação sem pendências.
          </p>
        ) : (
          datasets.flatMap((dataset) =>
            dataset.items.map((item) => {
              const key = itemKey(item);
              const canResolve =
                dataset.dataset === "eventos_edicoes" &&
                item.sourceTable === "tb_mkt.eventos_edicoes" &&
                item.reasonCode === "MKT_EDITION_EVENT_AMBIGUOUS" &&
                item.resolution === null;
              return (
                <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700" key={`${dataset.dataset}:${key}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-white">{DATASET_LABELS[dataset.dataset]} · {item.reasonCode}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">Origem: {item.sourceTable} · campo: {item.field ?? "não informado"}</p>
                      <p className="break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">{item.sourceIdentityDigest}</p>
                    </div>
                    {item.resolution ? (
                      <p className="flex shrink-0 items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                        <Check aria-hidden="true" className="mt-0.5 h-4 w-4" />
                        <span>Destino {canonicalEvents.find((event) => event.id === item.resolution?.canonicalTargetId)?.name ?? item.resolution.canonicalTargetId}; operador {item.resolution.actorId}; {formatDate(item.resolution.createdAt)}</span>
                      </p>
                    ) : canResolve ? (
                      <div className="flex w-full shrink-0 flex-col gap-2 sm:max-w-sm">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor={`target-${key}`}>Destino canônico explícito</label>
                        <select
                          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          id={`target-${key}`}
                          onChange={(event) => setSelectedTargets((current) => ({ ...current, [key]: event.target.value }))}
                          value={selectedTargets[key] ?? ""}
                        >
                          <option value="">Selecione um evento</option>
                          {canonicalEvents.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                        </select>
                        {targetsQuery.isError && <p className="text-xs text-rose-700 dark:text-rose-200" role="alert">Não foi possível listar destinos desta organização.</p>}
                        <button
                          className="min-h-10 rounded-md border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-200 dark:hover:bg-blue-950/40"
                          disabled={!selectedTargets[key] || resolveMutation.isPending || targetsQuery.isLoading}
                          onClick={() => resolveMutation.mutate({ sourceIdentityDigest: item.sourceIdentityDigest, stepId: item.stepId, canonicalTargetId: selectedTargets[key] ?? "" })}
                          type="button"
                        >
                          {resolveMutation.isPending ? "Registrando…" : "Registrar resolução auditada"}
                        </button>
                      </div>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">Pendente de tratamento</span>
                    )}
                  </div>
                </article>
              );
            }),
          )
        )}
      </section>

      <section aria-labelledby="marketing-reconciliation-decisions-heading" className="space-y-3">
        <h3
          className="text-base font-semibold text-slate-950 dark:text-white"
          id="marketing-reconciliation-decisions-heading"
        >
          Histórico de decisões
        </h3>
        {datasets.every((dataset) => dataset.decisions.length === 0) ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            Nenhuma decisão registrada para esta organização.
          </p>
        ) : (
          datasets.flatMap((dataset) =>
            dataset.decisions.map((decision) => (
              <article
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
                key={`${dataset.dataset}:${itemKey(decision)}`}
              >
                <p className="font-semibold text-slate-900 dark:text-white">
                  {DATASET_LABELS[dataset.dataset]} · {decision.sourceTable}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {decision.sourceIdentityDigest}
                </p>
                <p className="mt-2 text-xs text-slate-700 dark:text-slate-200">
                  Destino {canonicalEvents.find((event) => event.id === decision.canonicalTargetId)?.name ?? decision.canonicalTargetId}; operador {decision.actorId}; {formatDate(decision.createdAt)}
                </p>
              </article>
            )),
          )
        )}
      </section>
    </section>
  );
}
