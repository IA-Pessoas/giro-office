import { setupAPIClient } from "@shared/services/api";
import { CONTABIL_ENDPOINTS, unwrapContabilEnvelope } from "./contabilService.contract";

export interface NoahReceipt {
  id: string;
  created_by: string;
  created_at: string;
  source_name: string;
  source_sha256: string;
  result_sha256: string;
  row_count: number;
  file_count: number;
  rejections: Array<{ file: string; reason: string }>;
}

export const contabilNoahService = {
  async convert(file: File): Promise<NoahReceipt> {
    const response = await setupAPIClient().post(CONTABIL_ENDPOINTS.noah, file, {
      params: { filename: file.name },
      headers: { "Content-Type": "application/zip" },
    });
    return unwrapContabilEnvelope(response.data);
  },
  async download(id: string): Promise<Blob> {
    const response = await setupAPIClient().get(CONTABIL_ENDPOINTS.noahCsv(id), {
      responseType: "blob",
    });
    return response.data;
  },
};
