import { useMutation } from "@tanstack/react-query";

import { reportsService } from "../services/reportsService";

export function useReportPreview() {
  return useMutation({ mutationFn: reportsService.preview });
}
