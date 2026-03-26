import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaCommercial } from "../../shared/components/newLayout/FigmaCommercial";

export default function CommercialPage() {
  return (
    <>
      <Head>
        <title>Comercial</title>
      </Head>
      <FigmaCommercial />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});

