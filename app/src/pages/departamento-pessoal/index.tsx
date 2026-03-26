import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaDepartamentoPessoal } from "../../shared/components/newLayout/FigmaDepartamentoPessoal";

export default function DepartamentoPessoalPage() {
  return (
    <>
      <Head>
        <title>Departamento Pessoal</title>
      </Head>
      <FigmaDepartamentoPessoal />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

