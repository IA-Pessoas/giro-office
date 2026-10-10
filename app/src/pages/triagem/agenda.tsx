import Head from "next/head";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { AccessDeniedPanel, DepartmentAgendaSection } from "@modules/contabil";

// A agenda é do departamento, não de um cliente: fica fora da tela operacional da Triagem.
export default function TriagemAgendaPage() {
  const { access, isLoading } = useModuleAccess("triagem");

  return (
    <>
      <Head>
        <title>Agenda da Triagem</title>
      </Head>
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando permissões de triagem...</p>
      ) : !access.canView ? (
        <AccessDeniedPanel />
      ) : (
        <div className="mx-auto max-w-[1600px] space-y-6">
          <header>
            <Link
              href="/triagem"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para a Triagem
            </Link>
            <h1 className="mt-2 mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
                <CalendarDays className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              Agenda da Triagem
            </h1>
          </header>
          <DepartmentAgendaSection module="triagem" canEdit={access.canEdit} />
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
