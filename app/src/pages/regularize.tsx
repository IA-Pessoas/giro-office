import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaRegularize } from "../shared/components/newLayout/FigmaRegularize";

export default function RegularizePage() {
  return (
    <>
      <Head>
        <title>Regularize</title>
      </Head>
      <FigmaRegularize />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
