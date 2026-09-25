import { toast as baseToast } from "react-toastify";
import { createAppToast } from "./appToast.ts";

/** Use este `toast` em vez do de `react-toastify`: aplica dedupe e limpeza de erros (#1364). */
export const toast = createAppToast(baseToast);
