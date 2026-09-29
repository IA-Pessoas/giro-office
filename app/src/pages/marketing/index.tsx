import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { MarketingDashboard } from "@modules/marketing/components/MarketingDashboard";
import { MarketingAiUsageControls } from "@modules/marketing/components/MarketingAiUsageControls";
import { MarketingInstagramProfiles } from "@modules/marketing/components/MarketingInstagramProfiles";

export default function MarketingPage() {
  return (
    <>
      <Head>
        <title>Marketing</title>
      </Head>
      <main className="space-y-6 p-6">
        <MarketingDashboard />
        <MarketingAiUsageControls />
        <MarketingInstagramProfiles />
      </main>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => ({ props: {} }));
