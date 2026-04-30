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
} from "@modules/clients/utils/integrationForm";
import { useMe } from "@shared/hooks/useMe";
import {
  validateCpfCnpjDocument,
  validateOptionalCpfDocument,
} from "@modules/clients/utils/documentValidation";

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
      toast.error("Não foi possível identificar a organização do usuário.");
      return;
    }

    if (!formValues.name.trim() || !formValues.cpf_cnpj.trim()) {
      toast.error("Preencha nome e CPF/CNPJ para continuar.");
      return;
    }

    const cpfCnpjError = validateCpfCnpjDocument(formValues.cpf_cnpj, formValues.type);

    if (cpfCnpjError) {
      toast.error(cpfCnpjError);
      return;
    }

    const responsibleCpfError = validateOptionalCpfDocument(
      "CPF do responsável",
      formValues.cpf_responsible,
    );

    if (responsibleCpfError) {
      toast.error(responsibleCpfError);
      return;
    }

    const agentCpfError = validateOptionalCpfDocument("CPF do preposto", formValues.cpf_agent);

    if (agentCpfError) {
      toast.error(agentCpfError);
      return;
    }

    try {
      const createdClient = await createIntegrationMutation.mutateAsync(
        buildCreateClientIntegrationPayload(formValues, organizationId),
      );

      toast.success("Cliente de integração cadastrado com sucesso.");
      await router.push(`/clients/${createdClient.id}`);
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error ===
          "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Erro ao cadastrar cliente de integração.";

      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Novo cliente de integração</title>
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
              Novo cliente por integração
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Crie um cliente usando o fluxo dedicado de integração.
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
