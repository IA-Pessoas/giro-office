import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { ParcelamentoShell } from "@modules/parcelamento";

export default function ParcelamentoPage() {
  return (
    <>
      <Head>
        <title>Parcelamento</title>
      </Head>
      <ParcelamentoShell />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

