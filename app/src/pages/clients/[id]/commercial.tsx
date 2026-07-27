import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";

import { canSSRAuth } from "@modules/auth";
import { ClientCommercialForm } from "@modules/clients/components/ClientCommercialForm";
import { useClient, useUpdateClientCommercialMutation } from "@modules/clients/hooks/useClients";
import type { ClientCommercialFormValues } from "@modules/clients/types";
import {
  buildCommercialPayload,
  createCommercialInitialValues,
  hasCommercialChanges,
} from "@modules/clients/utils/commercialForm";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export default function ClientCommercialPage() {
  const router = useRouter();
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const updateCommercialMutation = useUpdateClientCommercialMutation(clientId ?? "");
  const client = clientQuery.data;
  const [formValues, setFormValues] = useState<ClientCommercialFormValues | null>(null);

  useEffect(() => {
    if (!client) {
      return;
    }

    setFormValues(createCommercialInitialValues(client));
  }, [client]);

  const hasChanges = useMemo(() => {
    if (!client || !formValues) {
      return false;
    }

    return hasCommercialChanges(formValues, client);
  }, [client, formValues]);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;

    setFormValues((current) =>
      current
        ? {
            ...current,
            [name]: value,
          }
        : current,
    );
  };

  const handleSubmit = async () => {
    if (!clientId || !client || !formValues || !hasChanges) {
      return;
    }

    if (!formValues.prospecting_status.trim()) {
      toast.error("Selecione o status da prospecção para continuar.");
      return;
    }

    try {
      await updateCommercialMutation.mutateAsync(buildCommercialPayload(formValues, client));
      toast.success("Fluxo comercial atualizado com sucesso.");
      await router.push(`/clients/${clientId}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível atualizar o fluxo comercial.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Comercial do cliente</title>
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
              {client?.name ? `Comercial de ${client.name}` : "Comercial do cliente"}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Página dedicada para atualização do fluxo comercial.
            </p>
          </div>
        </div>

        {clientQuery.isLoading ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Carregando cliente...
          </section>
        ) : clientQuery.isError ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}>
            Não foi possível carregar o cliente para o fluxo comercial.
          </section>
        ) : !clientId ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente inválido.
          </section>
        ) : !client ? (
          <section className={`${PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
            Cliente não encontrado.
          </section>
        ) : formValues ? (
          <section className={`${PANEL_CLASSNAME} p-6`}>
            <ClientCommercialForm
              values={formValues}
              onChange={handleInputChange}
              onSubmit={() => void handleSubmit()}
              onCancel={() => setFormValues(createCommercialInitialValues(client))}
              submitLabel={updateCommercialMutation.isPending ? "Salvando..." : "Salvar alterações"}
              disabled={updateCommercialMutation.isPending}
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
