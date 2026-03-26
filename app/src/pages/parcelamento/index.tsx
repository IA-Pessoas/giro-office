import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Parcelamento } from "../../shared/components/newLayout/Parcelamento";

export default function ParcelamentoPage() {
  return (
    <>
      <Head>
        <title>Parcelamento</title>
      </Head>
      <Parcelamento />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

