import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaContabil } from "../shared/components/newLayout/FigmaContabil";

export default function ContabilPage() {
  return (
    <>
      <Head>
        <title>Contábil</title>
      </Head>
      <FigmaContabil />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
