import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaAdministracao } from "../../shared/components/newLayout/FigmaAdministracao";

export default function AdministracaoPage() {
  return (
    <>
      <Head>
        <title>Administração</title>
      </Head>
      <FigmaAdministracao />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

