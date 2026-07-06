import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { TiPage } from "@modules/ti";

export default function TecnologiaPage() {
  return (
    <>
      <Head>
        <title>Tecnologia</title>
      </Head>
      <TiPage />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

