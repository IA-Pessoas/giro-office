import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";

import { canSSRAuth } from "@modules/auth";
import { ClientIntegrationForm } from "@modules/clients/components/ClientIntegrationForm";
import {
  useClient,
  useUpdateClientIntegrationMutation,
} from "@modules/clients/hooks/useClients";
import type { UpdateClientIntegrationFormValues } from "@modules/clients/types";
import {
  buildUpdateClientIntegrationPayload,
  createUpdateClientIntegrationInitialValues,
  hasUsableIntegrationData,
} from "@modules/clients/utils/integrationForm";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export default function ClientIntegrationPage() {
  const router = useRouter();
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const updateIntegrationMutation = useUpdateClientIntegrationMutation(clientId ?? "");
  const client = clientQuery.data;
  const [formValues, setFormValues] = useState<UpdateClientIntegrationFormValues | null>(null);

  useEffect(() => {
    if (!client) {
      return;
    }

    setFormValues(createUpdateClientIntegrationInitialValues(client));
  }, [client]);

  const updatePayload = useMemo(() => {
    if (!client || !formValues) {
      return {};
    }

    return buildUpdateClientIntegrationPayload(formValues, client);
  }, [client, formValues]);

  const hasChanges = Object.keys(updatePayload).length > 0;

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = event.target;
    const nextValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    setFormValues((current) =>
      current
        ? {
            ...current,
            [name]: nextValue,
          }
        : current,
    );
  };

  const handleSubmit = async () => {
    if (!clientId || !client || !hasChanges) {
      return;
    }

    try {
      await updateIntegrationMutation.mutateAsync(updatePayload);
      toast.success("Cliente de integração atualizado com sucesso.");
      await router.push(`/clients/${clientId}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível atualizar o cliente de integração.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Integração do cliente</title>
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
              {client?.name ? `Integração de ${client.name}` : "Integração do cliente"}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Página dedicada para atualização dos dados de integração.
            </p>
          </div>
        </div>

        {clientQuery.isLoading ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Carregando cliente...
          </section>
        ) : clientQuery.isError ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}>
            Não foi possível carregar o cliente para o fluxo de integração.
          </section>
        ) : !clientId ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente inválido.
          </section>
        ) : !client ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente não encontrado.
          </section>
        ) : !hasUsableIntegrationData(client) ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Este cliente ainda não possui dados mínimos de integração para edição.
          </section>
        ) : formValues ? (
          <section className={`${PANEL_CLASSNAME} p-6`}>
            <ClientIntegrationForm
              mode="edit"
              values={formValues}
              onChange={handleInputChange}
              onSubmit={() => void handleSubmit()}
              onCancel={() => setFormValues(createUpdateClientIntegrationInitialValues(client))}
              submitLabel={updateIntegrationMutation.isPending ? "Salvando..." : "Salvar alterações"}
              disabled={updateIntegrationMutation.isPending}
              submitDisabled={!hasChanges}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
