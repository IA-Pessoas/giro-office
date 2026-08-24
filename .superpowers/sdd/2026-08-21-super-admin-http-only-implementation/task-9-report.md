# Task 9 report

## Entrega

- Adicionado o console protegido `/super-admin`, com diretório paginado e pesquisável de organizações.
- A seleção de tenant habilita a consulta paginada e pesquisável de usuários; sem seleção, nenhuma query de usuários é disparada.
- Adicionada auditoria global paginada e pesquisável por rota via `/platform/audit/requests`.
- Todos os painéis cobrem carregamento, erro com retry, vazio e sucesso, com controles acessíveis e layout responsivo.
- O console é somente leitura: não há mutações, modo de suporte ou CTA inerte.
- A tabela de usuários segue o select real do backend (`id`, `name`, `login`, `status`, `department_id`, `photo_url` e `type`); perfil nulo é apresentado como `Sem perfil`.
- A alternância entre usuários e auditoria usa botões nativos com estado pressionado, sem semântica incompleta de tabs.

## Isolamento de sessão e navegação

- O frontend usa exclusivamente o cliente de plataforma server-driven e não lê, decodifica nem envia credenciais manualmente.
- `canSSRPlatformAdmin` protege a página pelo retorno de `/platform/me` no servidor.
- O destino do guard, `/super-admin/login`, é tratado como rota pública pelo layout global.
- Trocas, logout e invalidação da sessão cancelam e removem todo o prefixo React Query `["platform"]`, impedindo que dados do principal anterior reapareçam.
- O AppShell desabilita a query organizacional `/user/me` para a identidade de plataforma, não usa dados organizacionais em cache e mostra somente a navegação Super Admin.
- Usuários organizacionais não recebem o item de navegação do console.
- Assistente e notificações organizacionais ficam ocultos no ambiente de plataforma; o menu de usuário mantém apenas o logout real.

## Evidência TDD e validação

- RED: `corepack pnpm --filter @workspace/app run test:super-admin` falhou porque o serviço de plataforma ainda não existia.
- RED adicional: a regressão de troca de tenant falhou enquanto a query de usuários ainda reutilizava `placeholderData`.
- RED de revisão: os contratos falharam para rota pública ausente, cache de plataforma preservado, DTO fictício e semântica incompleta de tabs.
- GREEN: `corepack pnpm --filter @workspace/app run test:super-admin` passou com 9 contratos.
- O teste comportamental de sessão semeou caches de plataforma e organização e comprovou a remoção exclusiva do prefixo de plataforma na troca de principal.
- Regressões: `test:auth`, `test:platform-session` e `test:pagination` passaram.
- `corepack pnpm --filter @workspace/app typecheck` passou.
- `corepack pnpm --filter @workspace/app build` passou e listou `/super-admin` como rota SSR dinâmica.
- O Graphify não possui grafo local neste worktree; foi usada a descoberta manual prevista no `AGENTS.md`.
- As validações executaram em Node 24, enquanto o workspace declara Node 22.
- Screenshots não foram produzidos porque pertencem à Tarefa 10.
