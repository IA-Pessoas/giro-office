import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { MarketingDashboard } from "@modules/marketing/components/MarketingDashboard";
import { MarketingCanonicalQueries } from "@modules/marketing/components/MarketingCanonicalQueries";
import { MarketingAiUsageControls } from "@modules/marketing/components/MarketingAiUsageControls";
import { MarketingInstagramProfiles } from "@modules/marketing/components/MarketingInstagramProfiles";
import { MarketingPasswords } from "@modules/marketing/components/MarketingPasswords";

export default function MarketingPage() {
  return (
    <>
      <Head>
        <title>Marketing</title>
      </Head>
      <main className="space-y-6 p-6">
        <MarketingCanonicalQueries />
        <MarketingDashboard />
        <MarketingAiUsageControls />
        <MarketingInstagramProfiles />
        <MarketingPasswords />
      </main>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => ({ props: {} }));
