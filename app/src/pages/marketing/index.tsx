import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { MarketingDashboard, useMarketingDashboard } from "@modules/marketing";

export default function MarketingPage() {
  const marketingDashboardQuery = useMarketingDashboard();

  return (
    <>
      <Head>
        <title>Marketing</title>
      </Head>
      <MarketingDashboard
        stats={marketingDashboardQuery.data ?? null}
        isLoading={marketingDashboardQuery.isLoading || marketingDashboardQuery.isFetching}
        isError={marketingDashboardQuery.isError}
        onRetry={() => {
          void marketingDashboardQuery.refetch();
        }}
      />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
