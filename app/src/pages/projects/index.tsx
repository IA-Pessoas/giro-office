import type { GetServerSideProps } from "next";

import { canSSRAuth } from "@modules/auth";
import { Projects } from "../../shared/components/newLayout/Projects";

export default function ProjectsPage() {
  return <Projects />;
}

export const getServerSideProps: GetServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

