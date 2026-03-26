import type { GetServerSideProps } from "next";

import { canSSRAuth } from "@modules/auth";
import { FigmaProjects } from "../../shared/components/newLayout/FigmaProjects";

export default function ProjectsPage() {
  return <FigmaProjects />;
}

export const getServerSideProps: GetServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

