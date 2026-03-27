import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Fiscal } from "../shared/components/newLayout/Fiscal";

export default function FiscalPage() {
  return (
    <>
      <Head>
        <title>Fiscal</title>
      </Head>
      <Fiscal />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
