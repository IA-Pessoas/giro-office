import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { CommercialDashboard, useCommercialDashboard } from "@modules/comercial";

export default function CommercialPage() {
  const commercialDashboardQuery = useCommercialDashboard();

  return (
    <>
      <Head>
        <title>Comercial</title>
      </Head>
      <CommercialDashboard
        stats={commercialDashboardQuery.data ?? null}
        isLoading={commercialDashboardQuery.isLoading || commercialDashboardQuery.isFetching}
        isError={commercialDashboardQuery.isError}
        onRetry={() => {
          void commercialDashboardQuery.refetch();
        }}
      />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
