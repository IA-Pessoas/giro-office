import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const fiscalSearchQuerySchema = z
  .object({
    ncmCode: zNonEmptyText("ncmCode"),
  })
  .strict();
