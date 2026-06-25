import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Configuracoes } from "../../shared/components/newLayout/Configuracoes";

export default function ConfiguracoesPage() {
  return (
    <>
      <Head>
        <title>Configurações</title>
      </Head>
      <Configuracoes />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

