import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { MarketingBirthdayReport } from "@modules/marketing/components/MarketingBirthdayReport";
import { MarketingDashboard } from "@modules/marketing/components/MarketingDashboard";
import { MarketingCanonicalQueries } from "@modules/marketing/components/MarketingCanonicalQueries";
import { MarketingAiUsageControls } from "@modules/marketing/components/MarketingAiUsageControls";
import { MarketingInstagramProfiles } from "@modules/marketing/components/MarketingInstagramProfiles";
import { MarketingPasswords } from "@modules/marketing/components/MarketingPasswords";
import { MarketingEvents } from "@modules/marketing/components/MarketingEvents";
import { MarketingStockReport } from "@modules/marketing/components/MarketingStockReport";

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
            Eventos, pesquisas e atividades de Marketing da organização.
          </p>
        </header>
        <MarketingCanonicalQueries />
        <MarketingDashboard />
        <MarketingBirthdayReport />
        <MarketingStockReport />
        <MarketingEvents />
        <MarketingAiUsageControls />
        <MarketingInstagramProfiles />
        <MarketingPasswords />
      </main>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => ({ props: {} }));
