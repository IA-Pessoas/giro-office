import { useCallback, useState } from "react";

import type { ReportBuilderState } from "../types/report.types";
import { createInitialReportBuilderState } from "../utils/reportBuilder";

export function useReportBuilder() {
  const [state, setState] = useState<ReportBuilderState>(() => createInitialReportBuilderState());

  const update = useCallback(<K extends keyof ReportBuilderState>(key: K, value: ReportBuilderState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  }, []);

  const reset = useCallback((sourceKey: string) => {
    setState(createInitialReportBuilderState(sourceKey));
  }, []);

  return { state, setState, update, reset };
}
