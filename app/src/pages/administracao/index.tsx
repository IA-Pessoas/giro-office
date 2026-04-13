import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Administracao } from "../../shared/components/newLayout/Administracao";

export default function AdministracaoPage() {
  return (
    <>
      <Head>
        <title>Administração</title>
      </Head>
      <Administracao />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

