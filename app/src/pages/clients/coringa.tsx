import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { ClientCoringaList } from "@modules/clients/components/ClientCoringaList";

export default function ClientCoringaPage() {
  return <><Head><title>Lista Coringa | Clientes</title></Head><ClientCoringaList /></>;
}

export const getServerSideProps = canSSRAuth(async () => ({ props: {} }));
