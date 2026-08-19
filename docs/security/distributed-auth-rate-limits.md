# Limites distribuídos de autenticação: rollout

## Escopo e backend

O gateway e o user-service limitam `POST /user/session`; `POST /user/start-config` usa apenas a
categoria `ip`. O backend compartilhado é PostgreSQL, na tabela
`security.rate_limit_buckets`, criada por
`infra/prisma/migrations/20260819120000_add_auth_rate_limit_buckets/migration.sql`.

Cada consumo usa um UPSERT atômico no banco. As chaves armazenadas são HMAC e os buckets vencidos
são reutilizados pela próxima tentativa; a migration não agenda remoção física de linhas. O
adaptador em memória existe somente para injeção explícita em testes. Em produção, não habilite,
nem introduza, fallback local.

## Pré-requisitos

1. Aplicar a migration no banco de produção pelo fluxo normal de migrations antes de implantar um
   processo com `AUTH_RATE_LIMIT_DEGRADATION_MODE=block`. Esta tarefa não aplica migrations.
2. Confirmar que as credenciais de banco usadas pelo gateway e pelo user-service alcançam o mesmo
   banco, podem usar o schema `security` e ler/escrever a tabela de buckets.
3. Provisionar `AUTH_RATE_LIMIT_KEY_SECRET` no gerenciador de segredos, sem colocá-lo em arquivos,
   logs, métricas ou documentação. Em produção ele é obrigatório e tem pelo menos 32 caracteres.
   Gateway e user-service devem receber o mesmo valor para compartilhar os buckets.
4. Definir `TRUSTED_PROXY_CIDRS` somente com as faixas CIDR dos proxies reversos controlados. A
   lista vazia é o padrão seguro: cabeçalhos encaminhados não alteram a identidade de rede usada
   pelo limite.

## Variáveis de ambiente

Use os mesmos valores em gateway e user-service, salvo uma decisão operacional documentada. Os
valores são validados como inteiros positivos e os máximos evitam configurações descontroladas.

| Variável | Padrão | Regra |
| --- | --- | --- |
| `AUTH_RATE_LIMIT_KEY_SECRET` | somente desenvolvimento | obrigatório em produção, mínimo de 32 caracteres; nunca registrar o valor |
| `AUTH_RATE_LIMIT_IP_MAX` | `10` | 1 a 1.000 |
| `AUTH_RATE_LIMIT_ACCOUNT_MAX` | `3` | 1 a 1.000 |
| `AUTH_RATE_LIMIT_IP_ACCOUNT_MAX` | `5` | 1 a 1.000 |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` | 60.000 a 86.400.000 ms |
| `AUTH_RATE_LIMIT_TIMEOUT_MS` | `1000` | 1.000 a 10.000 ms |
| `AUTH_RATE_LIMIT_DEGRADATION_MODE` | `block` | `block` ou `observe` |
| `TRUSTED_PROXY_CIDRS` | vazio | lista separada por vírgulas, apenas CIDRs válidos |
| `DATABASE_URL` | sem padrão de produção | necessário para o backend PostgreSQL; o gateway o exige em produção |

Um pedido que atravesse gateway e user-service pode consumir no limite dos dois processos. Ajuste
os limiares com essa composição em mente e exercite tanto o caminho público quanto o direto no
canário.

## Canário e promoção

1. Depois da migration e da configuração de segredos, implantar uma réplica de cada processo com
   `AUTH_RATE_LIMIT_DEGRADATION_MODE=observe` por uma janela curta e definida.
2. Em `observe`, uma decisão que excede um bucket é permitida e emite evento seguro; indisponibilidade
   ou timeout do storage também permite temporariamente o pedido. Não use este modo como estado
   permanente.
3. Comparar as categorias agregadas com a linha de base e investigar qualquer degradação antes de
   ampliar o canário. Não coletar valores de rede, identificadores de conta, corpos, cabeçalhos ou
   chaves de bucket para essa análise.
4. Promover ambos os processos para `block` na mesma janela de mudança. Nesse modo, exceder o
   limite retorna 429 com `Retry-After`; falha, ausência ou timeout do PostgreSQL retorna 503
   apenas nas rotas de autenticação.

## Observabilidade e alertas

Os eventos existentes são `auth.rate_limit.decision`, com as categorias `ip`, `account` e
`ip-account` mais o resultado `blocked` ou `observed`, e `auth.rate_limit.degraded`. Construa
contadores agregados somente por serviço, nome do evento, categoria e resultado. Não acrescente
identificadores, valores de rede, chaves HMAC, segredos, rota completa, query, cabeçalhos ou corpo.

Alertar para qualquer `auth.rate_limit.degraded` durante `block`; aumento persistente de
`observed` no canário; aumento inesperado de 429; e falhas ou latência do PostgreSQL que se
aproximem de `AUTH_RATE_LIMIT_TIMEOUT_MS`. Validar também o crescimento da tabela e as permissões
do papel de banco durante a janela de operação.

## Rollback de emergência

O rollback é limitado à configuração: mudar ambos os processos para `observe` por uma janela de
incidente curta e registrada, corrigir a causa no PostgreSQL e retornar a `block` após nova
verificação. Não trocar para contadores locais. Se for necessário voltar o binário, use uma versão
sem esse limitador distribuído; não substitua o backend por memória. A migration é aditiva e deve
permanecer aplicada durante o incidente, salvo plano aprovado pelo responsável pelo banco.
