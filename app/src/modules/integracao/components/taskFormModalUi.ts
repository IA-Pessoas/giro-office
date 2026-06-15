export const TASK_FORM_CONTENT_CLASSNAME =
  "w-[min(92vw,760px)] [&>footer]:px-4 [&>footer]:py-3 [&>header]:px-4 [&>header]:py-3";

export const TASK_FORM_BODY_CLASSNAME = "max-h-[64vh] overflow-y-auto !px-4 !py-3";

export const TASK_FORM_FORM_CLASSNAME = "space-y-3";

export const TASK_FORM_GRID_CLASSNAME = "grid gap-3 md:grid-cols-2";

export const TASK_FORM_THREE_COLUMN_GRID_CLASSNAME = "grid gap-3 md:grid-cols-3";

export const TASK_FORM_LABEL_CLASSNAME = "space-y-1.5";

export const TASK_FORM_TEXTAREA_CLASSNAME = "min-h-20 resize-y pl-10";

interface GetProjectSelectPlaceholderParams {
  hasClient: boolean;
  isLoading: boolean;
  projectCount: number | null;
}

export function getProjectSelectPlaceholder({
  hasClient,
  isLoading,
  projectCount,
}: GetProjectSelectPlaceholderParams): string {
  if (!hasClient) {
    return "Selecione o cliente primeiro";
  }

  if (isLoading) {
    return "Carregando projetos...";
  }

  if (projectCount === 0) {
    return "Nenhum projeto para este cliente";
  }

  return "Selecione um projeto";
}
