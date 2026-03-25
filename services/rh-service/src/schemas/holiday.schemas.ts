import { z } from "zod";
import { zNonEmptyText, zIsoDate } from "./rhGeneral.schemas.js";

export const createHolidayBodySchema = z.object({
    name: zNonEmptyText("name"),
    date: zIsoDate("date"),
  });
  
  export const updateHolidayBodySchema = z.object({
    id: zNonEmptyText("id"),
    name: zNonEmptyText("name"),
    date: zIsoDate("date"),
  });
  
  export const deleteHolidayBodySchema = z.object({
    id: zNonEmptyText("id"),
  });