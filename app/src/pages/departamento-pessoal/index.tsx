import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { PessoalShell } from "@modules/pessoal";

export default function DepartamentoPessoalPage() {
  return (
    <>
      <Head>
        <title>Departamento Pessoal</title>
      </Head>
      <PessoalShell />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

