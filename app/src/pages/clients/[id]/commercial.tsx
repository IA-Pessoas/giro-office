import Head from "next/head";

import { canSSRAuth } from "@modules/auth";

export default function ClientCommercialPage() {
  return (
    <>
      <Head>
        <title>Comercial do cliente</title>
      </Head>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { notFound: true };
});
