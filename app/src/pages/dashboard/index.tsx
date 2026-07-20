import React from "react";
import Head from "next/head";
import "react-toastify/dist/ReactToastify.css";

import { canSSRAuth } from "@modules/auth";
import { DashboardGrid, useDashboard } from "@modules/dashboard";

export default function Dashboard() {
  const { stats, isLoading, error, refetch } = useDashboard();

  return (
    <>
      <Head>
        <title>Dashboard</title>
      </Head>

      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Visão geral do Office com dados reais do workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Atualizar
          </button>
        </div>

        {error ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
            Não foi possível carregar os dados reais do dashboard.
          </section>
        ) : null}

        <DashboardGrid stats={stats} isLoading={isLoading} />
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
  return { props: {} };
});
