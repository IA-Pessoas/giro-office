import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaConfiguracoes } from "../../shared/components/newLayout/FigmaConfiguracoes";

export default function ConfiguracoesPage() {
  return (
    <>
      <Head>
        <title>Configurações</title>
      </Head>
      <FigmaConfiguracoes />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

