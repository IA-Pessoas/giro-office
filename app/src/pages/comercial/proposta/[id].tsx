import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { CommercialProposal } from "@modules/commercial/components/CommercialProposal";

export default function CommercialProposalPage({ clientId }: { clientId: string }) {
  return (
    <>
      <Head><title>Preparar proposta | Comercial</title></Head>
      <CommercialProposal clientId={clientId} />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async ({ params }) => {
  const clientId = typeof params?.id === "string" ? params.id : "";
  return clientId ? { props: { clientId } } : { notFound: true };
});
