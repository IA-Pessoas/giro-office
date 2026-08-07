import dynamic from "next/dynamic";
import Head from "next/head";
import "react-toastify/dist/ReactToastify.css";

import { canSSRAuth } from "@modules/auth";
import { ChartSkeleton } from "../../shared/components/charts/ChartSkeleton";

const DashboardContent = dynamic(
  () =>
    import("../../shared/components/newLayout/Dashboard").then((mod) => mod.Dashboard),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={320} />,
  },
);

export default function Dashboard() {
  return (
    <>
      <Head>
        <title>Dashboard</title>
      </Head>
      <DashboardContent />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async (_ctx) => {
  return { props: {} };
});
