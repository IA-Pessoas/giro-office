# Issue #1544 — Feedback e relatório da edição

## Objetivo e escopo

Entregar o ciclo de feedback e o relatório imprimível de uma edição de evento, com dados isolados por organização. Esta especificação cobre exclusivamente os critérios da issue #1544 e assume como base o modelo de edição implementado na #1543.

O legado de referência é `C:\Users\HP\Documents\Repositorios\workspace`. O fluxo atual do Giro Office e os contratos do monorepo continuam sendo a fonte para novos contratos; o legado serve para identificar dados e conteúdo que precisam ser preservados.

## Decisões de desenho aprovadas

- Cada edição possui um período de feedback com início e fim, administrado junto da edição.
- Cada edição possui no máximo uma avaliação gerida pela equipe, com nota de 1 a 5 e observação opcional. O vínculo é 1:1 e preserva a nota e observação.
- A edição e a avaliação usam relações persistidas e chaves estrangeiras. O período pertence diretamente à edição. O orçamento permanece no modelo relacional existente.
- O planejamento estruturado da edição permanece validado nos campos JSON já presentes: parcerias, equipe, logística, comunicação e atividades antes/durante/depois. A forma de leitura e escrita deve validar e preservar os campos aceitos.
- O relatório é obtido por endpoint autenticado e apresentado em página imprimível no frontend. A API é responsável pela autorização e pela composição dos dados; o browser apenas imprime os dados autorizados.
- Importação do legado só associa período ou avaliação quando a edição de destino puder ser identificada de forma inequívoca. Linhas sem correspondência única não são atribuídas por heurística; ficam disponíveis para reconciliação com tabela/identificador de origem e motivo explícito.

## Dados e comportamento

### Período e avaliação

O período guarda início e fim válidos, com fim igual ou posterior ao início. A edição pode não ter período configurado. A avaliação guarda uma nota inteira entre 1 e 5 e observação opcional, e a unicidade por edição é garantida no banco, não apenas na interface. A API rejeita segunda avaliação para a mesma edição com conflito de domínio.

Criar ou atualizar esses dados exige permissão de edição de Marketing e respeita o `organization_id` da sessão. Consultas de leitura e impressão exigem permissão de visualização de Marketing. Não se aceita organização ou edição de outro tenant informada pelo cliente para ampliar acesso.

### Importação e reconciliação

O processo de migração correlaciona as tabelas legadas de períodos e avaliações com a edição nova usando apenas chaves/mapeamentos determinísticos existentes no contexto de migração. O importador mantém nota, observação e demais metadados de origem que o novo modelo suportar. Não infere período ou avaliação a partir de nome, data aproximada ou texto livre.

Cada linha não importada por vínculo ausente ou ambíguo deve gerar registro de reconciliação que identifique a tabela e chave de origem, organização/evento quando verificáveis e a razão da pendência. Reexecução não duplica relações já importadas. O processo não altera nem descarta o dado de origem.

### Relatório imprimível

O relatório mostra, quando presentes, dados do evento e da edição, orçamento e itens, parcerias, equipe organizadora, logística, comunicação, atividades antes/durante/depois, notas de planejamento e feedback disponível (período e avaliação/observação). Campos opcionais ausentes são omitidos ou exibidos como indisponíveis de forma consistente, sem quebrar a impressão.

A rota resolve evento e edição dentro da organização autenticada antes de montar o relatório. Recurso inexistente ou pertencente a outra organização não vaza conteúdo e segue o contrato de erro do serviço. A tela de impressão não faz uma segunda consulta sem autorização nem injeta conteúdo legado como HTML executável.

## Fluxo entre componentes

1. Rotas Marketing validam params e bodies com os schemas Zod do serviço.
2. Services aplicam regras de período, unicidade e acesso a edição/evento usando o `organization_id` autenticado.
3. Prisma persiste o período na edição e a avaliação com restrição única por edição; o relatório lê relações da edição e do evento dentro do mesmo tenant.
4. O frontend inclui a edição do período/avaliação nos fluxos existentes de edições e abre uma visualização imprimível a partir dos dados retornados pela API.
5. A migração converte dados legados com correlação estrita e registra pendências para reconciliação.

## Tratamento de erros

- Dados inválidos: `400` com mensagem de validação em português.
- Edição/evento não encontrado no tenant autenticado: `404` sem revelar se existe em outro tenant.
- Tentativa de criar uma segunda avaliação para edição: `409`.
- Falha inesperada segue o envelope global de erro, sem serializar dados de origem ou detalhes internos.
- Falha de impressão no browser não altera nem remove os dados persistidos.

## Validação e evidências

A implementação deve cobrir, por testes automatizados, criação/atualização e limites do período, nota inválida, unicidade da avaliação, isolamento entre organizações, relatório com e sem campos opcionais, autorização da rota, importação determinística e quarentena/reconciliação de vínculos ausentes/ambíguos. Contratos novos devem estar alinhados entre rota, OpenAPI, gateway quando aplicável e smoke manifest.

Validar os fluxos reais no navegador e salvar screenshots legíveis e verificadas em `output/playwright/`, incluindo o relatório em tela e sua versão de impressão. Incluir no PR evidências que abram corretamente, comandos de validação e os resultados. Falhas de CI identificadas como billing/limitação do plano serão registradas separadamente de falhas reais de código.

## Limites de escopo

Não alterar o fluxo geral de eventos, redesenhar o módulo Marketing, revisar outras issues do milestone, completar dados legados sem vínculo inequívoco ou introduzir tipos de relatório fora da edição. O trabalho permanece restrito à issue #1544.
