import { canSSRAuth } from "@modules/auth";

// Modulo comercial desativado (0fc12873): link antigo volta para o detalhe do cliente em vez de 404.
export default function ClientCommercialPage() {
  return null;
}

export const getServerSideProps = canSSRAuth(async ({ params }) => {
  const id = typeof params?.id === "string" ? encodeURIComponent(params.id) : "";
  return { redirect: { destination: id ? `/clients/${id}` : "/clients", permanent: false } };
});
