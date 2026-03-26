import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaMarketing } from "../../shared/components/newLayout/FigmaMarketing";

export default function MarketingPage() {
  return (
    <>
      <Head>
        <title>Marketing</title>
      </Head>
      <FigmaMarketing />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});

