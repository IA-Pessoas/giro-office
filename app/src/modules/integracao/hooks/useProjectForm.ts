import { useCallback, useEffect, useState } from "react";

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

  const reset = useCallback((nextProject?: ProjectDetail | null) => {
    setValues(createInitialValues(nextProject ?? project));
  }, [project]);

  const validate = useCallback((): string | null => {
    if (!values.name.trim()) {
      return "Preencha o nome do projeto.";
    }

    if (!values.start_date) {
      return "Preencha a data de início.";
    }

    if (values.end_date && values.end_date < values.start_date) {
      return "A data final não pode ser anterior à data de início.";
    }

    if (!values.objective.trim()) {
      return "Preencha o objetivo do projeto.";
    }

    return null;
  }, [values.end_date, values.name, values.objective, values.start_date]);

  const buildCreatePayload = useCallback((clientId: string): CreateProjectData => {
    return {
      client_id: clientId,
      name: values.name.trim(),
      start_date: values.start_date,
      objective: values.objective.trim(),
      ...(values.end_date ? { end_date: values.end_date } : {}),
    };
  }, [values.end_date, values.name, values.objective, values.start_date]);

  const buildUpdatePayload = useCallback((projectId: string): UpdateProjectData => {
    return {
      project_id: projectId,
      name: values.name.trim(),
      start_date: values.start_date,
      end_date: values.end_date || values.start_date,
      objective: values.objective.trim(),
    };
  }, [values.end_date, values.name, values.objective, values.start_date]);

  return {
    values,
    setValues,
    updateValue,
    reset,
    validate,
    buildCreatePayload,
    buildUpdatePayload,
  };
}
