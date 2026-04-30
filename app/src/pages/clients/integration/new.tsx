import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, type ChangeEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";

import { canSSRAuth } from "@modules/auth";
import { ClientIntegrationForm } from "@modules/clients/components/ClientIntegrationForm";
import { useCreateClientIntegrationMutation } from "@modules/clients/hooks/useClients";
import {
  buildCreateClientIntegrationPayload,
  createClientIntegrationInitialValues,
  normalizeDocumentValue,
} from "@modules/clients/utils/integrationForm";
import { useMe } from "@shared/hooks/useMe";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export default function NewClientIntegrationPage() {
  const router = useRouter();
  const meQuery = useMe();
  const createIntegrationMutation = useCreateClientIntegrationMutation();
  const [formValues, setFormValues] = useState(createClientIntegrationInitialValues);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = event.target;
    const nextValue = type === "checkbox" ? (event.target as HTMLInputElement).checked : value;

    setFormValues((current) => ({
      ...current,
      [name]: nextValue,
    }));
  };

  const handleSubmit = async () => {
    const organizationId = meQuery.data?.organization_id;

    if (!organizationId) {
      toast.error("NÃ£o foi possÃ­vel identificar a organizaÃ§Ã£o do usuÃ¡rio.");
      return;
    }

    if (!formValues.name.trim() || normalizeDocumentValue(formValues.cpf_cnpj).length === 0) {
      toast.error("Preencha nome e CPF/CNPJ para continuar.");
      return;
    }

    try {
      const createdClient = await createIntegrationMutation.mutateAsync(
        buildCreateClientIntegrationPayload(formValues, organizationId),
      );

      toast.success("Cliente de integraÃ§Ã£o cadastrado com sucesso.");
      await router.push(`/clients/${createdClient.id}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Erro ao cadastrar cliente de integraÃ§Ã£o.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Novo cliente de integraÃ§Ã£o</title>
      </Head>

      <div className="space-y-6">
        <div className="space-y-2">
          <Link
            href="/clients"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para clientes
          </Link>

          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Novo cliente por integraÃ§Ã£o
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Crie um cliente usando o fluxo dedicado de integraÃ§Ã£o.
            </p>
          </div>
        </div>

        <section className={`${PANEL_CLASSNAME} p-6`}>
          <ClientIntegrationForm
            mode="create"
            values={formValues}
            onChange={handleInputChange}
            onSubmit={() => void handleSubmit()}
            onCancel={() => void router.push("/clients")}
            submitLabel={createIntegrationMutation.isPending ? "Salvando..." : "Salvar"}
            disabled={createIntegrationMutation.isPending || meQuery.isLoading}
          />
        </section>
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
