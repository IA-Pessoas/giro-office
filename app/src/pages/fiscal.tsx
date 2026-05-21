import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FiscalShell } from "@modules/fiscal";

export default function FiscalPage() {
  return (
    <>
      <Head>
        <title>Fiscal</title>
      </Head>
      <FiscalShell />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
