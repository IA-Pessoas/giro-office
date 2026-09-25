import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "@shared/services/toast";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { ClientTerminationForm } from "@modules/clients/components/ClientTerminationForm";
import { useClient, useTerminateClientMutation } from "@modules/clients/hooks/useClients";
import type { ClientTerminationFormValues } from "@modules/clients/types";
import {
  buildTerminationPayload,
  createTerminationInitialValues,
  isValidCompetenceOutput,
} from "@modules/clients/utils/terminationForm";
import {
  getClientLifecycleActions,
  mapClientStatusFromApi,
} from "@modules/clients/utils/statusMapper";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export default function ClientTerminationPage() {
  const router = useRouter();
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const terminateClientMutation = useTerminateClientMutation(clientId ?? "");
  const client = clientQuery.data;
  const [formValues, setFormValues] = useState<ClientTerminationFormValues>(
    createTerminationInitialValues(),
  );

  const isValid = useMemo(
    () =>
      formValues.reason.trim().length > 0 &&
      formValues.description.trim().length > 0 &&
      isValidCompetenceOutput(formValues.competence_output),
    [formValues],
  );

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;

    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!clientId || !client || !isValid) {
      return;
    }

    try {
      await terminateClientMutation.mutateAsync(buildTerminationPayload(formValues));
      toast.success("Processo de inativação iniciado com sucesso.");
      await router.push(`/clients/${clientId}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível iniciar o processo de inativação.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Inativação do cliente</title>
      </Head>

      <div className="space-y-6">
        <div className="space-y-2">
          <Link
            href={clientId ? `/clients/${clientId}` : "/clients"}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para detalhes do cliente
          </Link>

          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {client?.name ? `Inativação de ${client.name}` : "Inativação do cliente"}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Página dedicada para iniciar o processo de inativação do cliente.
            </p>
          </div>
        </div>

        {clientQuery.isLoading ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Carregando cliente...
          </section>
        ) : clientQuery.isError ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}>
            Não foi possível carregar o cliente para o fluxo de inativação.
          </section>
        ) : !clientId ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente inválido.
          </section>
        ) : !client ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente não encontrado.
          </section>
        ) : !getClientLifecycleActions(mapClientStatusFromApi(client.status)).canTerminate ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-600 dark:text-slate-300`}>
            A inativação só está disponível para clientes ativos.
          </section>
        ) : !integracaoAccess.isAdmin ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-600 dark:text-slate-300`}>
            A inativação de clientes exige permissão administrativa na Integração.
          </section>
        ) : (
          <section className={`${PANEL_CLASSNAME} p-6`}>
            <ClientTerminationForm
              values={formValues}
              onChange={handleInputChange}
              onSubmit={() => void handleSubmit()}
              onCancel={() => setFormValues(createTerminationInitialValues())}
              submitLabel={
                terminateClientMutation.isPending ? "Confirmando..." : "Confirmar inativação"
              }
              disabled={terminateClientMutation.isPending}
              submitDisabled={!isValid}
            />
          </section>
        )}
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
