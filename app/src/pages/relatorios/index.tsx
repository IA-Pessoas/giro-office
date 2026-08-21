import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { ReportsCatalogPage } from "@modules/reports/components/ReportsCatalogPage";

export default function RelatoriosPage() {
  return (
    <>
      <Head>
        <title>Relatórios</title>
      </Head>
      <ReportsCatalogPage />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
