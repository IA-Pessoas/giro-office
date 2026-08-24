import Head from "next/head";

import { canSSRPlatformAdmin } from "@modules/auth";
import { SuperAdminPage } from "@modules/superAdmin";

export default function SuperAdminIndexPage() {
  return (
    <>
      <Head>
        <title>Console Super Admin - Office</title>
      </Head>
      <SuperAdminPage />
    </>
  );
}

export const getServerSideProps = canSSRPlatformAdmin(async () => ({ props: {} }));
