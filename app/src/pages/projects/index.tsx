import Head from "next/head";
import type { GetServerSideProps } from "next";

import { canSSRAuth } from "@modules/auth";
import { ProjectsWorkspace } from "@modules/integracao";

export default function ProjectsPage() {
  return (
    <>
      <Head>
        <title>Projetos</title>
      </Head>
      <ProjectsWorkspace />
    </>
  );
}

export const getServerSideProps: GetServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
