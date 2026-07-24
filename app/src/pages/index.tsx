import { canSSRAuth } from "@modules/auth";
import { setupAPIClient } from "@shared/services/api";

export default function RootRedirect() {
  return null;
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
  const apiClient = setupAPIClient(ctx);
  await apiClient.get("/user/me");

  return {
    redirect: {
      destination: "/dashboard",
      permanent: false,
    },
  };
});
