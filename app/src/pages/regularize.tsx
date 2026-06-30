import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { RegularizePage as RegularizeModulePage } from "@modules/regularize";

export default function RegularizePage() {
  return (
    <>
      <Head>
        <title>Regularize</title>
      </Head>
      <RegularizeModulePage />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
