import Head from "next/head";

import { canSSRAuth } from "@modules/auth";

export default function ParcelamentoPage() {
  return (
    <>
      <Head>
        <title>Parcelamento</title>
      </Head>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    notFound: true,
  };
});
