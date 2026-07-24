import type { GetServerSideProps } from "next";

import { canSSRAuth } from "@modules/auth";
import { ProjectsWorkspace } from "@modules/integracao";

export default function ProjectsPage() {
  return <ProjectsWorkspace />;
}

export const getServerSideProps: GetServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
