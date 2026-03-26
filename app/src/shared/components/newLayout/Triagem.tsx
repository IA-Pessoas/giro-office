import { Filter, Wrench, Calendar, TrendingUp } from 'lucide-react';

export function Triagem() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
              <Filter className="w-6 h-6 text-white" />
            </div>
            Departamento de Triagem
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestão de demandas, relatórios e controle de pendências
          </p>
        </div>
      </div>

      {/* Under Construction */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-teal-100 to-teal-200 dark:from-teal-900/30 dark:to-teal-800/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Wrench className="w-12 h-12 text-teal-600 dark:text-teal-400" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Módulo em Construção
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
            O Departamento de Triagem está sendo desenvolvido e estará disponível em breve.
          </p>

          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-xl p-6 mb-8">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center justify-center gap-2">
              <Calendar className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              Funcionalidades Planejadas
            </h3>
            <ul className="text-left space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 dark:text-teal-400 mt-0.5">✓</span>
                <span>Dashboard com visão geral de tarefas e relatórios</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 dark:text-teal-400 mt-0.5">✓</span>
                <span>Gestão de tarefas e demandas interdepartamentais</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 dark:text-teal-400 mt-0.5">✓</span>
                <span>Relatórios e análises de triagem por período</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 dark:text-teal-400 mt-0.5">✓</span>
                <span>Integração com módulos Fiscal, Contábil e Regularize</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 dark:text-teal-400 mt-0.5">✓</span>
                <span>Controle de pendências e bloqueios por setor</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 dark:text-teal-400 mt-0.5">✓</span>
                <span>Automação de processos e notificações</span>
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <TrendingUp className="w-4 h-4" />
            <span>Acompanhe as atualizações do sistema</span>
          </div>
        </div>
      </div>
    </div>
  );
}

