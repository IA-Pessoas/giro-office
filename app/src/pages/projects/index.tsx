import type { GetServerSideProps } from "next";

import { canSSRAuth } from "../../utils/canSSRAuth";
import { AppShell } from "../../shared/components/newLayout/AppShell";
import { FigmaProjects } from "../../shared/components/newLayout/FigmaProjects";

export default function ProjectsPage() {
  return (
    <AppShell>
      <FigmaProjects />
    </AppShell>
  );
}

export const getServerSideProps: GetServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

