import Head from "next/head";

import { canSSRAuth } from "@modules/auth";

export default function CommercialPage() {
  return (
    <>
      <Head>
        <title>Comercial</title>
      </Head>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { notFound: true };
});
