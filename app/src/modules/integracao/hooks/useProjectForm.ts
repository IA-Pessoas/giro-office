import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CreateProjectData,
  ProjectDetail,
  ProjectFormValues,
  UpdateProjectData,
} from "../types";

function createInitialValues(project?: ProjectDetail | null): ProjectFormValues {
  return {
    name: project?.name ?? "",
    start_date: project?.start_date?.slice(0, 10) ?? "",
    end_date: project?.end_date?.slice(0, 10) ?? "",
    objective: project?.objective ?? "",
    status: project?.status ?? "",
  };
}

export function useProjectForm(project?: ProjectDetail | null) {
  const [values, setValues] = useState<ProjectFormValues>(() => createInitialValues(project));

  useEffect(() => {
    setValues(createInitialValues(project));
  }, [project]);

  const updateValue = useCallback((field: keyof ProjectFormValues, value: string) => {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const reset = useCallback(
    (nextProject?: ProjectDetail | null) => {
      setValues(createInitialValues(nextProject ?? project));
    },
    [project],
  );

  const validationErrors = useMemo(
    () => ({
      name: values.name.trim() ? null : "Preencha o nome do projeto.",
      start_date: values.start_date ? null : "Preencha a data de início.",
      objective: values.objective.trim() ? null : "Preencha o objetivo do projeto.",
    }),
    [values.name, values.objective, values.start_date],
  );

  const validate = useCallback(
    (): string | null =>
      validationErrors.name ?? validationErrors.start_date ?? validationErrors.objective,
    [validationErrors],
  );

  const buildCreatePayload = useCallback(
    (clientId: string): CreateProjectData => {
      return {
        client_id: clientId,
        name: values.name.trim(),
        start_date: values.start_date,
        objective: values.objective.trim(),
        ...(values.end_date ? { end_date: values.end_date } : {}),
      };
    },
    [values.end_date, values.name, values.objective, values.start_date],
  );

  const buildUpdatePayload = useCallback(
    (projectId: string): UpdateProjectData => {
      return {
        project_id: projectId,
        name: values.name.trim(),
        start_date: values.start_date,
        end_date: values.end_date || values.start_date,
        objective: values.objective.trim(),
        ...(values.status ? { status: values.status } : {}),
      };
    },
    [values.end_date, values.name, values.objective, values.start_date, values.status],
  );

  return {
    values,
    setValues,
    updateValue,
    reset,
    validate,
    validationErrors,
    buildCreatePayload,
    buildUpdatePayload,
  };
}
