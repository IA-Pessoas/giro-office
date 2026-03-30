import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Clients } from "../../shared/components/newLayout/Clients";

export default function ClientsPage() {
  return (
    <>
      <Head>
        <title>Clientes</title>
      </Head>
      <Clients />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});