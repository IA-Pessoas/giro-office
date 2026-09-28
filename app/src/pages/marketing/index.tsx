import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { MarketingDashboard } from "@modules/marketing/components/MarketingDashboard";
import { MarketingEvents } from "@modules/marketing/components/MarketingEvents";

export default function MarketingPage() {
  return (
    <>
      <Head>
        <title>Marketing</title>
      </Head>
      <main className="space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Marketing</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
            Eventos e atividades de Marketing da organização.
          </p>
        </header>
        <MarketingDashboard />
        <MarketingEvents />
      </main>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
