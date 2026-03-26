import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaFiscal } from "../shared/components/newLayout/FigmaFiscal";

export default function FiscalPage() {
  return (
    <>
      <Head>
        <title>Fiscal</title>
      </Head>
      <FigmaFiscal />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
