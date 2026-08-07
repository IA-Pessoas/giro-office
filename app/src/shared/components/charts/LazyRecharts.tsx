import dynamic from "next/dynamic";

import { ChartSkeleton } from "./ChartSkeleton";

const loading = () => <ChartSkeleton />;

export const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false, loading },
);

export const AreaChart = dynamic(
  () => import("recharts").then((m) => m.AreaChart),
  { ssr: false, loading },
);

export const Area = dynamic(
  () => import("recharts").then((m) => m.Area),
  { ssr: false, loading },
);

export const BarChart = dynamic(
  () => import("recharts").then((m) => m.BarChart),
  { ssr: false, loading },
);

export const Bar = dynamic(
  () => import("recharts").then((m) => m.Bar),
  { ssr: false, loading },
);

export const LineChart = dynamic(
  () => import("recharts").then((m) => m.LineChart),
  { ssr: false, loading },
);

export const Line = dynamic(
  () => import("recharts").then((m) => m.Line),
  { ssr: false, loading },
);

export const PieChart = dynamic(
  () => import("recharts").then((m) => m.PieChart),
  { ssr: false, loading },
);

export const Pie = dynamic(
  () => import("recharts").then((m) => m.Pie),
  { ssr: false, loading },
);

export const Cell = dynamic(
  () => import("recharts").then((m) => m.Cell),
  { ssr: false, loading },
);

export const XAxis = dynamic(
  () => import("recharts").then((m) => m.XAxis),
  { ssr: false, loading },
);

export const YAxis = dynamic(
  () => import("recharts").then((m) => m.YAxis),
  { ssr: false, loading },
);

export const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false, loading },
);

export const Tooltip = dynamic(
  () => import("recharts").then((m) => m.Tooltip),
  { ssr: false, loading },
);

export const Legend = dynamic(
  () => import("recharts").then((m) => m.Legend),
  { ssr: false, loading },
);

export const ComposedChart = dynamic(
  () => import("recharts").then((m) => m.ComposedChart),
  { ssr: false, loading },
);
