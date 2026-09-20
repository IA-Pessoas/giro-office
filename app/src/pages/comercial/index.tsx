import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { CommercialCatalog } from "@modules/commercial/components/CommercialCatalog";

export default function CommercialPage() {
  return (
    <>
      <Head>
        <title>Comercial</title>
      </Head>
      <CommercialCatalog />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
