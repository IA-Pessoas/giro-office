import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const createHolidayBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    date: zIsoDate("date"),
  })
  .strict();

export const updateHolidayBodySchema = z
  .object({
    id: zNonEmptyText("id"),
    name: zNonEmptyText("name"),
    date: zIsoDate("date"),
  })
  .strict();

export const deleteHolidayBodySchema = z
  .object({
    id: zNonEmptyText("id"),
  })
  .strict();
