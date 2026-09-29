# Reconciliação e ativação do Marketing

**Data:** 2026-09-29

**Status:** aguardando revisão da especificação

**Referência:** issue #1549 — Reconciliação final e ativação do Marketing

## Contexto

A issue pede uma visão consolidada dos registros preparados, importados e em quarentena por
conjunto de dados, resolução explícita de associações ambíguas, nova reconciliação após cada decisão
e ativação do módulo Marketing somente após validação de suas funções e contratos.

O código atual tem importadores e reconciliações específicas para uso de IA e senhas. As rotas de
reconciliação listam pendências, mas não registram resoluções, responsável ou data. As regras V4
classificam eventos, edições e feedbacks para importação ou quarentena. O acesso ao Marketing usa
`DISABLED_MODULE_KEYS`; a lista está vazia e `/marketing` está disponível. Não há uma superfície
consolidada para resolver as pendências dos conjuntos de Marketing.

O `develop` já contém o merge do PR #1581, que reuniu mudanças do fluxo de Marketing. O Graphify
não tem grafos no worktree; a navegação foi feita manualmente conforme o fallback do `AGENTS.md`.

## Objetivos

1. Exibir totais preparados, importados e em quarentena por conjunto de dados, indicando origem e
   motivo das pendências.
2. Permitir a operadores autorizados resolver somente associações ambíguas com seleção explícita
   de um destino canônico.
3. Gravar a identidade autenticada do responsável e a data/hora de cada resolução, mantendo o
   histórico auditável.
4. Reexecutar a reconciliação usando as decisões registradas e atualizar os totais sem alterar a
   fonte legada.
5. Impedir associações automáticas por aproximação de nome quando não existir vínculo canônico
   comprovado.
6. Manter Marketing bloqueado no Office até todas as funções inventariadas e seus critérios de
   autorização, organização, relatórios, segredos, rotas, navegação, importações e contratos
   passarem pelas validações integradas.

## Desenho

### Superfície operacional

Adicionar uma área de reconciliação de Marketing acessível somente a administradores de plataforma.
Ela ficará fora da navegação do módulo Marketing, pois o próprio módulo poderá permanecer
bloqueado durante a revisão dos dados. A organização será selecionada no contexto operacional e
validada no servidor; o cliente não poderá escolher outro tenant em cada chamada.

A tela mostrará os totais e as pendências agrupadas por conjunto, origem e motivo. Uma pendência
ambígua mostrará somente os metadados necessários e destinos canônicos elegíveis. Valores brutos,
senhas, payloads criptografados e dados pessoais que não sejam necessários para a decisão não serão
retornados à interface.

### Resolução e reconciliação

O serviço validará autorização, tenant, conjunto, registro de origem e destino canônico. A pessoa
operadora escolherá o destino explicitamente; nome, e-mail ou outro texto parecido não será usado
para selecionar ou sugerir um vínculo automaticamente. Pendências por dados inválidos, duplicados
ou segredos sem validação continuarão em quarentena até que exista uma correção segura e
comprovável.

Cada decisão persistirá o conjunto, a identidade estável do registro de origem, o destino canônico,
o responsável obtido do contexto autenticado e o instante gerado pelo servidor. A reconciliação
seguinte reaplicará essas decisões e produzirá novos totais. O registro de auditoria não poderá ser
alterado pelo cliente e não conterá segredos em claro.

Os adaptadores reaproveitarão os importadores e as regras V4 existentes para uso de IA, senhas,
eventos, edições e feedback. Resultados ausentes ou ainda não executados serão identificados como
indisponíveis; não serão apresentados como zero nem como importação concluída.

### Gate do módulo

O bloqueio será centralizado no mecanismo atual de módulos e deverá valer para navegação, acesso
direto à rota e resolução de permissões, inclusive para administradores globais. A área operacional
de Super Admin continuará acessível independentemente desse bloqueio.

Marketing só poderá sair da lista de módulos desabilitados quando os testes comprovarem todas as
funções inventariadas e os critérios integrados de autorização, isolamento por organização,
relatórios, segredos, rotas, navegação, importações e contratos. Até esse ponto, a implementação
de reconciliação poderá ser usada por operadores autorizados, mas o módulo ficará indisponível aos
usuários regulares.

### Fonte legada e segurança

A origem legada continuará somente para consulta. O fluxo não apagará nem corrigirá dados nessa
origem. Resoluções serão persistidas no Office com tenant e escopo de origem explícitos. A API
retornará payloads sanitizados; qualquer material secreto necessário ao processamento permanecerá
criptografado em repouso. A autorização de plataforma e o tenant serão conferidos no servidor em
todas as operações de leitura e resolução.

## Validação

- Testes de serviço e rota para agregação, isolamento por organização, autorização, destinos
  inexistentes, resolução explícita, histórico do responsável/data e reexecução.
- Testes provando que pendências ambíguas não são associadas por nome e que segredos não aparecem
  em respostas ou logs.
- Testes do acesso ao Marketing para usuários comuns, administradores de organização e
  administradores globais enquanto o gate estiver fechado e quando a ativação for autorizada.
- Validação alinhada entre rotas, OpenAPI, gateway, permissões e smoke de integração.
- Validação real no navegador da tela operacional e do bloqueio do módulo; screenshots em
  `output/playwright/`.
- Testes, lint, typecheck, build e revisão de segurança dos pacotes afetados.

## Fora do escopo

- Implementar as issues bloqueadoras #1542–#1548; esta execução permanece limitada à #1549.
- Associar dados por semelhança de nomes ou alterar dados no sistema legado.
- Revelar senhas ou expor dados brutos de quarentena na tela.
- Executar carga ou correção diretamente no banco legado ou em produção.
- Remover o gate antes de todas as validações do inventário passarem.

## Premissas e riscos

- O acesso operacional será restrito a administradores de plataforma, para permitir reconciliação
  enquanto Marketing está bloqueado.
- O contexto autenticado precisa fornecer identidade de operador e organização verificáveis; se
  algum fluxo de importação não preservar identidade estável do registro de origem, esse fluxo deve
  continuar sem resolução manual até que a identidade possa ser comprovada.
- As issues bloqueadoras ainda aparecem abertas no GitHub. O código existente será conferido por
  função e contrato; o estado aberto de uma issue, isoladamente, não será tratado como prova de
  ausência da função.
