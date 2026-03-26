import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { DepartamentoPessoal } from "../../shared/components/newLayout/DepartamentoPessoal";

export default function DepartamentoPessoalPage() {
  return (
    <>
      <Head>
        <title>Departamento Pessoal</title>
      </Head>
      <DepartamentoPessoal />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

