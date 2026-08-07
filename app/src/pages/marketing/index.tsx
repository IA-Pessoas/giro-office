import Head from "next/head";

import { canSSRAuth } from "@modules/auth";

export default function MarketingPage() {
  return (
    <>
      <Head>
        <title>Marketing</title>
      </Head>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { notFound: true };
});
