import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import {
  AccessDeniedPanel,
  ContabilShell,
  useContabilPermissions,
} from "@modules/contabil";

export default function ContabilPage() {
  const { canViewContabil, canEditContabil, isLoading } = useContabilPermissions();

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
          <ContabilShell canEdit={canEditContabil} />
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
