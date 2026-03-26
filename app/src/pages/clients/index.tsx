import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaClients } from "../../shared/components/newLayout/FigmaClients";

export default function ClientsPage() {
  return (
    <>
      <Head>
        <title>Clientes</title>
      </Head>
      <FigmaClients />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});