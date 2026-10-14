/** Usuário ativo e os acessos específicos que a TI concede (#1938). */
export interface TiSpecificAccess {
  id: string;
  name: string;
  full_name: string | null;
  department: string | null;
  /** Conclui tarefas diretamente; sem ele, concluir vira solicitação de conclusão. */
  task_completion: boolean;
}
