import { useMemo, useState } from "react";
import Head from "next/head";
import { Users } from "lucide-react";

import { canSSRAuth } from "@modules/auth";
import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import {
  AccessDeniedPanel,
  ContabilShell,
  useContabilPermissions,
} from "@modules/contabil";

export default function ContabilPage() {
  const { canViewContabil, canEditContabil, isLoading } = useContabilPermissions();
  const [selectedClient, setSelectedClient] = useState<ClientPickerOption | null>(null);
  const selectedClientId = selectedClient?.id;
  const selectedClientName = selectedClient?.name;

  const selectedClientSummary = useMemo(() => {
    if (!selectedClientId || !selectedClientName) {
      return null;
    }

    return {
      id: selectedClientId,
      name: selectedClientName,
    };
  }, [selectedClientId, selectedClientName]);

  return (
    <>
      <Head>
        <title>Contábil</title>
      </Head>

      <div className="space-y-6">
        {isLoading ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Carregando permissões do módulo contábil...
          </section>
        ) : !canViewContabil ? (
          <AccessDeniedPanel />
        ) : (
          <ContabilShell
            key={selectedClientId ?? "without-client"}
            clientId={selectedClientId}
            clientName={selectedClientName}
            canEdit={canEditContabil}
            defaultTab={selectedClientId ? "control" : "client"}
            clientPickerContent={
            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Seleção de cliente
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-slate-400">
                        Escolha o cliente para abrir o fluxo contábil operacional.
                      </p>
                    </div>
                  </div>
                </div>

                {selectedClientSummary ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Cliente atual:{" "}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedClientSummary.name}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4">
                <ClientPickerModal
                  selectedClient={selectedClient}
                  onSelectClient={setSelectedClient}
                  filters={{ ref: "deps", status: "Departamento contabil" }}
                />
              </div>
            </section>
            }
          />
        )}
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
