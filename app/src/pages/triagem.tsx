import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { CalendarDays, ListChecks, Settings } from "lucide-react";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import {
  AccessDeniedPanel,
  FiscalTriagePortfolioSection,
  TriageDocumentHistorySection,
  TriageDocumentsSection,
  useTriageEditability,
} from "@modules/contabil";
import {
  TriageCompetenceSection,
  TriageOverviewPanel,
  TriageSolicitationsSection,
} from "@modules/triagem";

export default function TriagemPage() {
  const { access, isLoading } = useModuleAccess("triagem");
  const { access: contabilAccess } = useModuleAccess("contabil");
  const { access: fiscalAccess } = useModuleAccess("fiscal");
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const editability = useTriageEditability(client?.id ?? "");
  const fiscalEditability = useTriageEditability(
    fiscalAccess.canView ? client?.id ?? "" : "",
    "FISCAL",
  );

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
        <div className="mx-auto max-w-[1600px] space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                  <ListChecks className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                Triagem
              </h1>
              <p className="mt-1 text-gray-600 dark:text-slate-400">
                Pendências documentais e extratos por banco.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/triagem/agenda"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Agenda
              </Link>
              <Link
                href="/triagem/catalogos"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                Catálogos
              </Link>
              <ClientPickerModal
                selectedClient={client}
                onSelectClient={setClient}
                filters={{
                  status: "Ativo",
                  legacyIntegrationStatusFilter: false,
                }}
              />
            </div>
          </header>
          <TriageOverviewPanel clientId={client?.id} />
          <TriageSolicitationsSection
            client={client}
            canEdit={access.canEdit}
            canViewFiscal={fiscalAccess.canView}
            canEditFiscal={fiscalAccess.canEdit}
          />
          {fiscalAccess.canView ? (
            <FiscalTriagePortfolioSection canStartCompetence={access.canEdit} />
          ) : null}
          {client ? (
            <>
              <TriageCompetenceSection clientId={client.id} canEdit={access.canEdit} />
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <TriageDocumentsSection
                  clientId={client.id}
                  canEdit={editability.data?.can_edit === true}
                  canEditClosing={contabilAccess.canEdit}
                />
              </div>
              {fiscalAccess.canView ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <TriageDocumentsSection
                    clientId={client.id}
                    canEdit={
                      fiscalAccess.canEdit && fiscalEditability.data?.can_edit === true
                    }
                    canEditClosing={false}
                    documentType="FISCAL"
                  />
                </div>
              ) : null}
              <TriageDocumentHistorySection
                key={client.id}
                clientId={client.id}
                clientName={client.name}
              />
            </>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                Selecione um cliente para consultar as pendências documentais.
              </div>
              {access.isAdmin || contabilAccess.isAdmin ? <TriageDocumentHistorySection /> : null}
            </>
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
