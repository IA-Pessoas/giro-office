import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Commercial } from "../../shared/components/newLayout/Commercial";

export default function CommercialPage() {
  return (
    <>
      <Head>
        <title>Comercial</title>
      </Head>
      <Commercial />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});

