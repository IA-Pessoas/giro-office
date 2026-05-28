import type { ReactNode } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft } from "lucide-react";

import { canSSRAuth } from "@modules/auth";
import { useClient } from "@modules/clients/hooks/useClients";
import {
  AccessDeniedPanel,
  ContabilShell,
  useContabilPermissions,
} from "@modules/contabil";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";
const PANEL_TEXT_CLASSNAME = "p-6 text-sm";

function PanelMessage({
  children,
  tone = "default",
}: {
  children: string;
  tone?: "default" | "danger";
}) {
  const toneClassName =
    tone === "danger"
      ? "text-rose-600 dark:text-rose-300"
      : "text-slate-500 dark:text-slate-400";

  return (
    <section className={`${PANEL_CLASSNAME} ${PANEL_TEXT_CLASSNAME} ${toneClassName}`}>
      {children}
    </section>
  );
}

export default function ClientContabilPage() {
  const router = useRouter();
  const clientId = typeof router.query.id === "string" ? router.query.id : undefined;
  const clientQuery = useClient(clientId);
  const { canViewContabil, canEditContabil, isLoading } = useContabilPermissions();
  const client = clientQuery.data;
  let content: ReactNode;

  if (!clientId) {
    content = <PanelMessage>Cliente inválido.</PanelMessage>;
  } else if (clientQuery.isLoading) {
    content = <PanelMessage>Carregando cliente...</PanelMessage>;
  } else if (clientQuery.isError) {
    content = (
      <PanelMessage tone="danger">
        Não foi possível carregar o cliente para o fluxo contábil.
      </PanelMessage>
    );
  } else if (!client) {
    content = <PanelMessage>Cliente não encontrado.</PanelMessage>;
  } else if (isLoading) {
    content = <PanelMessage>Carregando permissões do módulo contábil...</PanelMessage>;
  } else if (!canViewContabil) {
    content = (
      <AccessDeniedPanel description="Você não possui permissão para acessar o fluxo contábil deste cliente." />
    );
  } else {
    content = (
      <ContabilShell
        clientId={client.id}
        clientName={client.name}
        lockedClient
        canEdit={canEditContabil}
      />
    );
  }

  return (
    <>
      <Head>
        <title>Contábil do cliente</title>
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
        </div>

        {content}
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
