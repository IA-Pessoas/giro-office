import Head from "next/head";

import { canSSRAuth } from "@modules/auth";

export default function TriagemPage() {
  return (
    <>
      <Head>
        <title>Triagem</title>
      </Head>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    notFound: true,
  };
});
