// Só os tipos: o ProjectWizardService cria o projeto na própria transação com
// `createProjectInTransaction`; o client HTTP do Node não tem chamador em produção.
export interface CreateProjectFromWizardParams {
  userId: string;
  organizationId: string;
  permission?: number;
  userType?: "owner" | "admin" | "user";
  modules?: Record<string, number>;
  idempotencyKey: string;
  client_id: string;
  name: string;
  start_date: Date;
  end_date?: Date;
  objective: string;
}

export type CreatedProject = Record<string, unknown> & { id: string };
