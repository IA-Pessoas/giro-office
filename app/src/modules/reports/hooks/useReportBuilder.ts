import { useState } from "react";
import type { ReportComposition } from "../types/report.types";

export function useReportBuilder() {
  const [areas, setAreas] = useState<ReportComposition["areas"]>([]);
  function toggleArea(source: string) {
    setAreas((current) =>
      current.some((area) => area.source === source)
        ? current.filter((area) => area.source !== source)
        : [...current, { source, fields: [] }],
    );
  }
  return { areas, setAreas, toggleArea };
}