# Design: resiliencia de conexoes e auditoria (#870, #871, #872)

## Objetivo

Eliminar a multiplicacao descontrolada de pools Prisma, manter o consumo de conexoes abaixo do
limite do Supabase Pooler e impedir que falhas transitorias descartem auditorias silenciosamente.

## Decisoes

- Cada processo Prisma recebe `DATABASE_POOL_MAX`, validado como inteiro positivo, com default `1`.
  Enquanto producao usar session mode e pool size 20, os 18 processos previstos consomem no
  maximo 18 slots e preservam dois slots de margem.
- Todo pool limita a espera por conexao com `DATABASE_POOL_CONNECTION_TIMEOUT_MS`, default `5000`.
- O guard descobre construtores de pool no repositorio, calcula o budget de regime/rollout e o
  deploy valida os `.env.vps.*` reais contra a capacidade declarada do pooler.
- O `audit-service` mantem exatamente um PrismaClient por processo, inclusive em producao, e o
  desconecta uma unica vez durante shutdown.
- O recorder de auditoria continua fire-and-forget no Gateway. Falhas de rede, HTTP 408/425/429 e
  5xx recebem ate seis tentativas com backoff exponencial e jitter. Outros 4xx sao descartados sem
  retry. O numero de entregas pendentes fica limitado; overflow e esgotamento das tentativas geram
  eventos `error` contabilizaveis.
- A outbox duravel permanece fora deste patch e deve evoluir com o trabalho de jobs citado na #871.
- A troca de `DATABASE_URL` para transaction mode e o ajuste do pool size sao operacoes externas.
  O repositorio documenta preflight, orcamento e validacao, sem alterar ou registrar credenciais.

## Verificacao

- Testes unitarios validam parsing, teto, retry HTTP, retry de rede, overflow e descarte final.
- Teste do Audit prova que chamadas repetidas em producao reutilizam cliente e adapter.
- Typecheck e testes escopados cobrem Shared, Gateway, Audit e os servicos Prisma alterados.
- O runbook fornece comandos para confirmar zero `EMAXCONNSESSION`, memoria e conexoes depois do
  deploy.
