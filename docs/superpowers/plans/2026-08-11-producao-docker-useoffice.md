# Giro Office Production Docker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar toda a stack estável do Giro Office em Docker neste host, publicada pelo Caddy em `useoffice.com.br`, com runtime independente de `git pull`, rollback e smoke autenticado de todos os departamentos.

**Architecture:** Uma única stack Compose chamada `giro-office-production` executará imagens imutáveis sem bind mounts. A UI entrará numa rede externa `public-edge` compartilhada somente com o Caddy existente; `/api` será encaminhado pelo Next.js ao gateway interno. Um script local construirá todas as imagens antes da recriação, aplicará migrations, aguardará endpoints e restaurará as imagens anteriores em falha.

**Tech Stack:** Docker Engine/Compose, Node.js 22, pnpm 9.15.0, Next.js, Express, Prisma/PostgreSQL, Supabase Storage, Caddy 2, Playwright.

## Global Constraints

- `git pull` não pode reiniciar nem encerrar containers.
- Aceita-se downtime curto somente durante um deploy explícito.
- Nexus e o Supabase local existentes não podem ser interrompidos.
- Segredos reais ficam somente em arquivos ignorados com modo `0600`.
- O Caddy existente continua sendo o único processo nas portas públicas 80/443.
- O deploy usa `useoffice.com.br`; `www.useoffice.com.br` redireciona para o domínio raiz.
- A chave `SUPABASE_SERVICE_ROLE_KEY` jamais entra no frontend, em Git ou em logs.
- Build de imagens deve ser sequencial devido aos 2 CPUs e 7,8 GiB de RAM do host.
- O encerramento exige smoke autenticado de todos os departamentos e relatório de memória.

---

### Task 1: Contrato Compose específico de produção

**Files:**
- Create: `docker-compose.production.yml`
- Modify: `scripts/check-compose-security.mjs`
- Test: `scripts/check-compose-security.test.mjs`

**Interfaces:**
- Consumes: serviços e redes definidos em `docker-compose.vps.yml`.
- Produces: override que remove portas públicas da UI/gateway, desativa o Nginx interno por profile e conecta `web` à rede externa `public-edge`.

- [ ] **Step 1: Escrever testes que expressem o isolamento esperado**

Adicionar fixtures que verifiquem: `web` é o único serviço ligado a `public-edge`; gateway e serviços internos não entram nessa rede; nenhuma porta de serviço Giro é publicada no host no Compose de produção.

```js
test("production compose exposes only web on public-edge and no host ports", async () => {
  const result = await checkComposeSecurity({
    composeFiles: ["docker-compose.vps.yml", "docker-compose.production.yml"],
    registry,
  });
  assert.deepEqual(result.errors, []);
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test scripts/check-compose-security.test.mjs`

Expected: FAIL porque `docker-compose.production.yml` ainda não existe ou a regra para `public-edge` ainda não está satisfeita.

- [ ] **Step 3: Criar o override mínimo de produção**

O arquivo deve resolver para esta estrutura:

```yaml
services:
  reverse-proxy:
    profiles: ["internal-proxy"]
    ports: !override []
  web:
    ports: !override []
    networks:
      - edge
      - backend
      - public-edge
  gateway:
    ports: !override []

networks:
  public-edge:
    external: true
    name: public-edge
```

- [ ] **Step 4: Validar segurança e resolução do Compose**

Run: `node --test scripts/check-compose-security.test.mjs`

Run: `docker compose -p giro-office-production -f docker-compose.vps.yml -f docker-compose.production.yml config --services`

Expected: os 17 serviços de aplicação (`web`, `gateway` e 15 serviços de domínio) aparecem; `reverse-proxy` não entra no profile padrão.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.production.yml scripts/check-compose-security.mjs scripts/check-compose-security.test.mjs
git commit -m "feat(deploy): isolate production stack behind Caddy"
```

### Task 2: Deploy local transacional e verificações pontuais

**Files:**
- Create: `scripts/ops/deploy-production.sh`
- Create: `scripts/ops/wait-production-endpoints.sh`
- Test: `scripts/production-deploy.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `docker-compose.vps.yml`, `docker-compose.production.yml`, `.env.vps.*` e `WORKSPACE_VPS_IMAGE_TAG`.
- Produces: `pnpm deploy:production`, que valida, constrói antes da troca, aplica migrations, sobe, testa e reverte imagens em falha.

- [ ] **Step 1: Escrever testes do dry-run**

Os testes executarão o script com `DEPLOY_DRY_RUN=1` e verificarão a ordem obrigatória:

```text
validate-env
compose-config
build-images-sequentially
database-migrate
compose-up
wait-endpoints
```

Também verificarão que `git pull` não aparece no script e que um build falho ocorre antes de qualquer `compose up`.

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test scripts/production-deploy.test.mjs`

Expected: FAIL porque os scripts ainda não existem.

- [ ] **Step 3: Implementar o script de endpoints**

Usar `curlimages/curl:8.12.0` nas redes `giro-office-production_backend` e `public-edge`. Verificar exatamente os endpoints já definidos em `scripts/ci/vps-wait-endpoints.sh`, mais:

```text
http://gateway:3010/ready
http://web:3000/
http://web:3000/api/health
```

O loop terá `PRODUCTION_WAIT_TIMEOUT=900`, intervalo de 10 segundos e falhará exibindo apenas nomes/URLs internos, nunca conteúdo de env.

- [ ] **Step 4: Implementar o deploy transacional**

O script deve:

1. exigir todos os arquivos listados em `scripts/ci/vps-secrets.manifest`;
2. exigir modo `0600` nos arquivos de segredo;
3. executar `docker compose ... config --quiet`;
4. salvar os IDs das imagens atuais em `.deploy/production-image-ids-before.txt`;
5. construir sequencialmente cada serviço com `docker compose ... build <service>`;
6. executar `pnpm --filter @workspace/infra exec prisma migrate deploy` com `DATABASE_URL` lida de `.env.vps.organization-service` sem imprimi-la;
7. executar `docker compose ... up -d --no-build --remove-orphans`;
8. executar `wait-production-endpoints.sh`;
9. em falha após a troca, reetiquetar os IDs anteriores e executar novamente `up -d --no-build`;
10. gravar o commit em `.deploy/production-last-good-commit` somente em sucesso.

- [ ] **Step 5: Expor o comando no workspace**

Adicionar ao `package.json`:

```json
"deploy:production": "bash scripts/ops/deploy-production.sh"
```

- [ ] **Step 6: Rodar testes e análise de shell**

Run: `node --test scripts/production-deploy.test.mjs scripts/ci-workflow-optimization.test.mjs`

Run: `bash -n scripts/ops/deploy-production.sh scripts/ops/wait-production-endpoints.sh`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/ops/deploy-production.sh scripts/ops/wait-production-endpoints.sh scripts/production-deploy.test.mjs
git commit -m "feat(deploy): add transactional production deployment"
```

### Task 3: Documentação operacional e templates seguros

**Files:**
- Create: `docs/production-deploy.md`
- Modify: `docs/vps-deploy.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `pnpm deploy:production` e a lista de `.env.vps.*`.
- Produces: procedimento repetível de primeiro deploy, atualização, rollback, DNS e migração futura.

- [ ] **Step 1: Documentar sem valores secretos**

Incluir os comandos exatos:

```bash
git pull --ff-only
pnpm deploy:production
docker compose -p giro-office-production -f docker-compose.vps.yml -f docker-compose.production.yml ps
```

Explicar que o primeiro comando não muda o runtime; somente o segundo causa a janela de downtime.

- [ ] **Step 2: Documentar DNS e Caddy**

Registrar A `useoffice.com.br -> 187.77.48.15`, CNAME `www -> useoffice.com.br`, rede `public-edge`, TLS automático e o requisito de não publicar gateway/serviços.

- [ ] **Step 3: Documentar rotação e migração futura**

Exigir rotação da senha PostgreSQL e da chave secreta Supabase compartilhadas na sessão. Descrever a futura troca para Supabase local como uma mudança coordenada de `DATABASE_URL`, `SUPABASE_URL`, chave backend, migrations e validação, sem alterar imagens.

- [ ] **Step 4: Validar formatação e ausência de segredos**

Run: `git diff --check`

Run: `rg -n "sb_secret_|postgresql://postgres\.[^:]+:" --glob '!*.lock' .`

Expected: nenhuma credencial real encontrada.

- [ ] **Step 5: Commit**

```bash
git add docs/production-deploy.md docs/vps-deploy.md .env.example
git commit -m "docs: add Giro Office production runbook"
```

### Task 4: Preparar host, segredos locais e Caddy

**Files:**
- Modify outside repo: `/root/projects/nexus/docker-compose.yml`
- Modify outside repo: `/root/projects/nexus/Caddyfile`
- Create ignored local files: `.env.vps.*`
- Create host state: `/swapfile`

**Interfaces:**
- Consumes: credenciais fornecidas pelo operador e os templates `.env.example`/`services/*/.env.example`.
- Produces: rede pública compartilhada, swap persistente, configuração Caddy e envs `0600` prontos para o Compose.

- [ ] **Step 1: Criar swap com validações destrutivas restritas ao alvo**

Verificar primeiro `swapon --show` e existência de `/swapfile`. Se ausente:

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

Adicionar exatamente `/swapfile none swap sw 0 0` a `/etc/fstab` somente se ainda não existir. Validar com `swapon --show` e `free -h`.

- [ ] **Step 2: Criar a rede compartilhada**

Run: `docker network inspect public-edge` ou, se ausente, `docker network create public-edge`.

- [ ] **Step 3: Materializar envs locais**

Gerar JWT, tokens internos e chaves de criptografia com `openssl rand`. Usar a URL HTTPS confirmada do Supabase e a conexão PostgreSQL fornecida, sem imprimi-las. Definir:

```text
NODE_ENV=production
NEXT_PUBLIC_API_URL=/api
API_INTERNAL_URL=http://gateway:3010
NEXT_PUBLIC_AUTH_COOKIE_SECURE=true
SERVICE_ALLOWED_ORIGINS=https://useoffice.com.br,https://www.useoffice.com.br
```

Configurar todos os upstreams do gateway por nome Compose, auditoria interna, Storage Supabase e buckets esperados. Aplicar `chmod 600 .env.vps.*` e confirmar `git status --ignored --short` sem fazer stage.

- [ ] **Step 4: Integrar Caddy à rede pública**

Adicionar ao Compose do Nexus:

```yaml
services:
  caddy:
    networks:
      - default
      - supabase
      - public-edge
networks:
  public-edge:
    external: true
    name: public-edge
```

Adicionar ao Caddyfile:

```caddyfile
www.useoffice.com.br {
  redir https://useoffice.com.br{uri} permanent
}

useoffice.com.br {
  reverse_proxy web:3000
}
```

- [ ] **Step 5: Validar e recarregar Caddy sem interromper Nexus**

Run: `docker exec nexus-caddy-1 caddy validate --config /etc/caddy/Caddyfile`

Run: `docker compose -f /root/projects/nexus/docker-compose.yml up -d --no-deps caddy`

Expected: Caddy volta a `Up`, `https://nexus.adm.br` continua respondendo e o container fica conectado a `public-edge`.

### Task 5: Build, migrations e inicialização da stack

**Files:**
- Runtime only: imagens `workspace-*`, containers `giro-office-production-*`, `.deploy/*`.

**Interfaces:**
- Consumes: implementação das Tasks 1–4.
- Produces: todos os serviços e UI em execução com dados externos.

- [ ] **Step 1: Validar Supabase atual antes da mutação**

Consultar `https://supabase.com/changelog.md`, documentação atual relevante de chaves secretas e Storage, testar conectividade HTTPS do projeto e conexão PostgreSQL sem imprimir segredos.

- [ ] **Step 2: Executar verificações rápidas do repositório**

Run: `pnpm harness:test`

Run: `pnpm security:compose`

Expected: PASS.

- [ ] **Step 3: Executar o deploy explícito**

Run: `pnpm deploy:production`

Expected: todas as imagens são construídas antes da troca; migrations terminam; os 17 containers entram em execução; checks internos passam.

- [ ] **Step 4: Verificar runtime e logs**

Run: `docker compose -p giro-office-production -f docker-compose.vps.yml -f docker-compose.production.yml ps -a`

Run: `docker compose -p giro-office-production -f docker-compose.vps.yml -f docker-compose.production.yml logs --tail=200`

Expected: nenhum container reiniciando, nenhum erro fatal de env, banco, Prisma ou Supabase.

- [ ] **Step 5: Verificar independência do checkout**

Comparar IDs/PIDs dos containers antes e depois de `git status` e de uma leitura do `git pull --dry-run`/`git fetch` sem executar deploy. Expected: runtime permanece inalterado.

### Task 6: DNS, HTTPS e smoke público

**Files:**
- No repository changes unless a deploy defect is found.

**Interfaces:**
- Consumes: DNS do operador e stack saudável.
- Produces: domínio público validado com TLS e API same-origin.

- [ ] **Step 1: Confirmar DNS público**

Run: consultar A de `useoffice.com.br` e CNAME/A de `www.useoffice.com.br` em resolvedor público.

Expected: ambos terminam em `187.77.48.15`. Se ainda apontarem ao IP antigo, informar o bloqueio externo e continuar smoke local com `Host`/`--resolve`.

- [ ] **Step 2: Testar roteamento local pelo Caddy**

Run: `curl --resolve useoffice.com.br:443:127.0.0.1 https://useoffice.com.br/`

Run: `curl --resolve useoffice.com.br:443:127.0.0.1 https://useoffice.com.br/api/health`

Expected: UI e gateway respondem sem expor portas internas.

- [ ] **Step 3: Testar domínio público**

Run: `curl -I https://useoffice.com.br`

Run: `curl -I https://www.useoffice.com.br/rota-de-teste`

Expected: HTTPS válido; `www` redireciona para o domínio raiz preservando a URI.

### Task 7: Usuário real e navegação autenticada completa

**Files:**
- Create if reusable automation is needed: `app/src/shared/run-production-departments-smoke.mjs`
- Test: browser smoke against `https://useoffice.com.br`.

**Interfaces:**
- Consumes: banco migrado, gateway público, UI e um usuário owner ativo.
- Produces: evidência por módulo de rota, API, console e renderização.

- [ ] **Step 1: Localizar usuário elegível sem expor dados sensíveis**

Consultar apenas `id`, `login`, `status`, organização e níveis de permissão. Escolher usuário ativo com acesso global. Não consultar nem imprimir hashes.

- [ ] **Step 2: Criar usuário somente se necessário**

Se não houver usuário elegível, usar o modelo Prisma oficial para criar organização/departamentos ausentes, um owner ativo e permissões de todos os módulos. Gerar senha aleatória, armazená-la apenas durante o teste e entregá-la ao operador no relatório final.

- [ ] **Step 3: Testar login pela UI**

Executar Playwright contra o domínio real, preencher login/senha e confirmar sessão autenticada, cookie `cw.token` seguro e carregamento do layout principal.

- [ ] **Step 4: Percorrer todos os módulos visíveis**

Enumerar o menu renderizado em vez de depender somente de uma lista fixa. Visitar cada entrada e, no mínimo, Administração, Clientes, Tarefas/Integração, Projetos, RH, Fiscal, Contábil, Regularize, TI, Certificados, Pessoal e Parcelamento quando disponíveis.

Para cada rota, registrar:

```text
module | route | HTTP/API failures | console errors | visible result | pass/fail
```

- [ ] **Step 5: Corrigir e repetir falhas dentro do escopo**

Para erro encontrado, usar `superpowers:systematic-debugging`, reproduzir, localizar logs do serviço, corrigir com TDD quando houver código e repetir o módulo e o smoke completo.

- [ ] **Step 6: Preservar evidência sem segredos**

Guardar apenas relatório, screenshots necessárias e nomes de módulos. Não versionar token, senha, chave Supabase ou resposta sensível.

### Task 8: Verificação final e relatório de memória

**Files:**
- Modify: `docs/production-deploy.md` only if runtime evidence changes the runbook.

**Interfaces:**
- Consumes: stack estável e smoke autenticado aprovado.
- Produces: medição final e handoff operacional.

- [ ] **Step 1: Invocar a verificação de conclusão**

Usar `superpowers:verification-before-completion` antes de qualquer afirmação de sucesso.

- [ ] **Step 2: Capturar memória do host**

Run: `free -h`

Run: `swapon --show`

Run: `docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}'`

- [ ] **Step 3: Calcular consumo do Giro Office**

Somar a coluna de memória somente dos containers do projeto `giro-office-production` e separar de Nexus/Supabase. Informar RAM total, usada, disponível, swap usada, total Giro e maiores consumidores.

- [ ] **Step 4: Repetir verificações essenciais**

Revalidar containers, endpoints, domínio, login e amostra de cada módulo. Confirmar `git status --short` e diferenciar alterações versionadas, arquivos secretos ignorados e mudanças operacionais no repo Nexus/host.

- [ ] **Step 5: Entregar o handoff**

Informar URL, estado de cada serviço, usuário criado ou reutilizado, cobertura do navegador, memória, procedimento `git pull` + `pnpm deploy:production`, rollback, pendência DNS se houver e recomendação explícita de rotação das credenciais compartilhadas.
