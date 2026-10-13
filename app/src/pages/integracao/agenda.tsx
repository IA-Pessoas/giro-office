import Head from "next/head";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { IntegrationAgendaSection } from "@modules/integracao/components/IntegrationAgendaSection";

export default function IntegrationAgendaPage() {
  const { access, isLoading } = useModuleAccess("integracao");
  return (
    <>
      <Head><title>Agenda de Integração</title></Head>
      {isLoading ? <p>Carregando permissões...</p> : !access.canView ? <p role="alert">Acesso negado à agenda de Integração.</p> : (
        <main className="mx-auto max-w-[1600px] space-y-5">
          <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-blue-700 dark:text-blue-300"><ArrowLeft className="h-4 w-4" />Voltar para tarefas</Link>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Agenda de Integração</h1>
          <IntegrationAgendaSection canEdit={access.canEdit} />
        </main>
      )}
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => ({ props: {} }));
