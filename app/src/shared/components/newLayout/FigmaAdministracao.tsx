import { Shield } from 'lucide-react';
import { ModulePage } from '../components/module-page';

export function FigmaAdministracao() {
  return (
    <ModulePage
      title="Administração"
      description="Configurações do sistema, usuários e permissões"
      icon={Shield}
      buttonText="Novo Usuário"
      onButtonClick={() => console.log('Novo usuário')}
      stats={[
        { label: 'Usuários Ativos', value: 48 },
        { label: 'Perfis de Acesso', value: 12 },
        { label: 'Logs de Auditoria', value: 1543, subtext: 'Últimos 30 dias' },
      ]}
    />
  );
}

