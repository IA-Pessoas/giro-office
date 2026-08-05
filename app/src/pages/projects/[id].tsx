import Head from "next/head";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";

import { canSSRAuth } from "@modules/auth";
import { ProjectDetailView } from "@modules/integracao";

export default function ProjectDetailPage() {
  const router = useRouter();
  const projectId = typeof router.query.id === "string" ? router.query.id : undefined;

  return (
    <>
      <Head>
        <title>Detalhe do projeto</title>
      </Head>

      {!projectId ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Projeto inválido.
        </section>
      ) : (
        <ProjectDetailView projectId={projectId} />
      )}
    </>
  );
}

export const getServerSideProps: GetServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
