import Head from "next/head";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import { AccessDeniedPanel } from "@modules/contabil";
import { TriageCatalogSection } from "@modules/triagem";

// Catálogos são configuração: ficam fora da tela operacional da Triagem.
export default function TriagemCatalogosPage() {
  const { access, isLoading } = useModuleAccess("triagem");

  return (
    <>
      <Head>
        <title>Catálogos da Triagem</title>
      </Head>
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando permissões de triagem...</p>
      ) : !access.canView ? (
        <AccessDeniedPanel />
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          <header>
            <Link
              href="/triagem"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar para a Triagem
            </Link>
            <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              Catálogos da Triagem
            </h1>
            <p className="mt-1 text-gray-600 dark:text-slate-400">
              Justificativas, tipos de link, métodos de entrega e sites estaduais usados nas
              pendências.
            </p>
          </header>
          <TriageCatalogSection canEdit={access.canEdit} />
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
