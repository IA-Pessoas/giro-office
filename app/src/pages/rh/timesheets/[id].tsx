import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

import { canSSRAuth } from "@modules/auth";
import { RhTimesheetDetailView } from "@modules/rh/components/RhTimesheetDetailView";

export default function RhTimesheetDetailPage() {
  const router = useRouter();
  const timesheetId = typeof router.query.id === "string" ? router.query.id : null;

  return (
    <>
      <Head>
        <title>Folha de ponto</title>
      </Head>

      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-600 dark:text-blue-300">
              RH
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
              Folha de ponto completa
            </h1>
          </div>

          <Link
            href="/rh"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Voltar para RH
          </Link>
        </div>

        <RhTimesheetDetailView timesheetId={timesheetId} initialFilter="all" mode="page" />
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
