import { useState } from "react";
import Head from "next/head";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { AccessDeniedPanel, TriageDocumentsSection, useTriageEditability } from "@modules/contabil";

export default function TriagemPage() {
  const { access, isLoading } = useModuleAccess("triagem");
  const { access: contabilAccess } = useModuleAccess("contabil");
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const editability = useTriageEditability(client?.id ?? "");

  return (
    <>
      <Head>
        <title>Triagem</title>
      </Head>
      {isLoading ? (
        <p className="text-sm text-slate-500">
          Carregando permissões de triagem...
        </p>
      ) : !access.canView ? (
        <AccessDeniedPanel />
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Triagem
              </h1>
              <p className="mt-1 text-gray-600 dark:text-slate-400">
                Pendências documentais e extratos por banco.
              </p>
            </div>
            <ClientPickerModal
              selectedClient={client}
              onSelectClient={setClient}
              filters={{
                status: "Ativo",
                legacyIntegrationStatusFilter: false,
              }}
            />
          </header>
          {client ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <TriageDocumentsSection
                clientId={client.id}
                canEdit={editability.data?.can_edit === true}
                canEditClosing={contabilAccess.canEdit}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              Selecione um cliente para consultar as pendências documentais.
            </div>
          )}
        </div>
      )}
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
