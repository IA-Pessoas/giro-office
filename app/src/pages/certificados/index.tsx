import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { CertificatesWorkspace } from "@modules/certificates";

export default function CertificadosPage() {
  return (
    <>
      <Head>
        <title>Certificados</title>
      </Head>
      <CertificatesWorkspace />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
