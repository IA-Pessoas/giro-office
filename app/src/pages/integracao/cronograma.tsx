import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, ClipboardCopy } from "lucide-react";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { ClientPickerModal, type ClientPickerOption, useClient } from "@modules/clients";
import { formatCronogramaText, isCronogramaTaskOverdue } from "@modules/integracao/cronogramaPresentation";
import { INTEGRACAO_TASKS_QUERY_KEY } from "@modules/integracao/hooks/queryKeys";
import { cronogramaService } from "@modules/integracao/services/cronogramaService";
import {
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
} from "@modules/integracao/components/projectUi";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { formatCivilDate } from "@shared/utils/dateFormat";

function todayCivilDate(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

export default function IntegracaoCronogramaPage() {
  const router = useRouter();
  const { access, isLoading } = useModuleAccess("integracao");
  const routeClientId = typeof router.query.clientId === "string" ? router.query.clientId : undefined;
  const clientQuery = useClient(routeClientId);
  const client = clientQuery.data && clientQuery.data.id === routeClientId
    ? {
        id: clientQuery.data.id,
        name: clientQuery.data.company_name || clientQuery.data.name,
        document: clientQuery.data.cpf_cnpj,
      }
    : null;
  const [today, setToday] = useState(todayCivilDate);
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(() => setToday(todayCivilDate()), tomorrow.getTime() - Date.now() + 1000);
    return () => window.clearTimeout(timeout);
  }, [today]);
  const cronograma = useFetch(
    [...INTEGRACAO_TASKS_QUERY_KEY, "cronograma", client?.id],
    () => cronogramaService.list(client?.id ?? ""),
    { enabled: access.canView && Boolean(client?.id) },
  );

  function selectClient(selected: ClientPickerOption | null) {
    void router.replace(
      { pathname: "/integracao/cronograma", query: selected ? { clientId: selected.id } : {} },
      undefined,
      { shallow: true },
    );
  }

  async function copyCronograma() {
    if (!cronograma.data) return;
    try {
      await navigator.clipboard.writeText(formatCronogramaText(cronograma.data, today));
      toast.success("Cronograma copiado.");
    } catch {
      toast.error("Não foi possível copiar o cronograma.");
    }
  }

  return (
    <>
      <Head>
        <title>Cronograma de Integração</title>
      </Head>
      {isLoading ? <p>Carregando permissões...</p> : !access.canView ? (
        <p role="alert">Acesso negado ao cronograma de Integração.</p>
      ) : (
        <main className="mx-auto max-w-5xl space-y-5">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1 text-sm text-blue-700 dark:text-blue-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para tarefas
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Cronograma de Integração</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Tarefas em andamento com previsão, inclusive as vencidas.
              </p>
            </div>
            <ClientPickerModal
              selectedClient={client}
              onSelectClient={selectClient}
              filters={{}}
              triggerLabel="Selecionar cliente"
              allowClearSelection
            />
          </div>
          {!client ? (
            <section className={`${PROJECT_PANEL_CLASSNAME} p-5`}>
              Selecione um cliente para ver o cronograma.
            </section>
          ) : cronograma.isLoading ? (
            <section className={`${PROJECT_PANEL_CLASSNAME} p-5`}>Carregando cronograma...</section>
          ) : cronograma.isError ? (
            <section role="alert" className={`${PROJECT_PANEL_CLASSNAME} space-y-3 p-5`}>
              <p>Não foi possível carregar o cronograma.</p>
              <button
                type="button"
                className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                onClick={() => cronograma.refetch()}
              >
                Tentar novamente
              </button>
            </section>
          ) : cronograma.data ? (
            <section className={`${PROJECT_PANEL_CLASSNAME} p-5`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {cronograma.data.client.company_name || cronograma.data.client.name}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {cronograma.data.tasks.length} tarefa(s) com previsão
                  </p>
                </div>
                <button
                  type="button"
                  className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                  onClick={copyCronograma}
                  disabled={cronograma.data.tasks.length === 0}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  Copiar texto
                </button>
              </div>
              {cronograma.data.tasks.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Nenhuma tarefa em andamento com previsão para este cliente.
                </p>
              ) : (
                <ol className="divide-y divide-slate-200 dark:divide-slate-700">
                  {cronograma.data.tasks.map((task) => {
                    const overdue = isCronogramaTaskOverdue(task.prevision_date, today);
                    return (
                      <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <Link
                          href={`/tasks?clientId=${client.id}&taskId=${task.id}`}
                          className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                        >
                          {task.name}
                        </Link>
                        <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          {formatCivilDate(task.prevision_date)}
                          {overdue && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                              Vencida
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          ) : null}
        </main>
      )}
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => ({ props: {} }));
