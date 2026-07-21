import Head from "next/head";

import { canSSRPlatformAdmin } from "@modules/auth";
import { SuperAdminPage } from "@modules/superAdmin";

export const getServerSideProps = canSSRPlatformAdmin;

export default function SuperAdminIndexPage() {
  return (
    <>
      <Head>
        <title>Super Admin</title>
      </Head>
      <SuperAdminPage />
    </>
  );
}
