import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const colors = ["#2563eb", "#0891b2", "#7c3aed", "#ea580c", "#16a34a"];

export type ChartSeries = { key: string; label: string };
export type ChartRow = { name: string; value?: number; [key: string]: string | number | undefined };

export function ReportChartView({
  type,
  rows,
  series,
  title,
}: {
  type: "bar" | "line" | "pie";
  rows: ChartRow[];
  series: ChartSeries[];
  title: string;
}) {
  return (
    <div className="h-72 w-full" role="img" aria-label={`Gráfico ${type === "bar" ? "de barras" : type === "line" ? "de linhas" : "de setores"}: ${title}. Valores na tabela abaixo.`}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "pie" ? (
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
              {rows.map((row, index) => <Cell key={`${row.name}-${index}`} fill={colors[index % colors.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        ) : type === "bar" ? (
          <BarChart data={rows} margin={{ bottom: 18, left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
            <XAxis dataKey="name" tickFormatter={(value: string) => value.length > 14 ? `${value.slice(0, 13)}…` : value} angle={-25} textAnchor="end" height={64} />
            <YAxis />
            <Tooltip />
            <Legend />
            {series.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={colors[index % colors.length]} />)}
          </BarChart>
        ) : (
          <LineChart data={rows} margin={{ bottom: 18, left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
            <XAxis dataKey="name" tickFormatter={(value: string) => value.length > 14 ? `${value.slice(0, 13)}…` : value} angle={-25} textAnchor="end" height={64} />
            <YAxis />
            <Tooltip />
            <Legend />
            {series.map((item, index) => <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={colors[index % colors.length]} strokeWidth={2} dot />)}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
