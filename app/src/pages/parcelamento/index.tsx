import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaParcelamento } from "../../shared/components/newLayout/FigmaParcelamento";

export default function ParcelamentoPage() {
  return (
    <>
      <Head>
        <title>Parcelamento</title>
      </Head>
      <FigmaParcelamento />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

