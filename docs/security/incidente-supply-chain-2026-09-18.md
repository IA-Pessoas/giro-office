# Incidente de supply chain — terceira onda (2026-09-18)

Runbook de contenção e saneamento. Todos os dados abaixo foram verificados pela API do
GitHub e por inspeção dos objetos git em 2026-09-18.

## Situação

Em 2026-09-18, entre 06:03 e 06:34 UTC, a conta `iapessoastecnologia` fez force push em
`main`, `develop` e `staging`, substituindo o HEAD por cópias forjadas com payload.
**635 de 646 branches remotas** carregam o payload, sempre com o mesmo tamanho.

| arquivo | limpo | infectado |
|---|---|---|
| `app/postcss.config.js` | 94 bytes | 8544 bytes |
| `lint-staged.config.mjs` | 766 bytes | 9309 bytes |

O payload fica na **mesma linha** do `};` final, depois de centenas de espaços — não aparece
em revisão superficial. Ele faz `global[...] = require` e sequestra `require`, `module`,
`__dirname` e `__filename`, então executa em qualquer `pnpm build`, `next build` ou commit
com hooks.

Como reconhecer o commit forjado: mantém autor, mensagem e instante UTC do legítimo, mas vem
**sem `gpgsig`** e com committer `Ed. <30671088+eedsilva@users.noreply.github.com>` em fuso
`+0100`. Em `main` e `staging` a mensagem do commit forjado é justamente
`fix(security): restaura configs executaveis sem payload` — ele finge ser a limpeza.

### Alvos de restauração (verificados limpos: 94 / 766 bytes)

| branch | HEAD forjado atual | restaurar para | quando o legítimo foi criado |
|---|---|---|---|
| `main` | `9d9e5a39` | **`b0d9831e`** | push de `eedsilva`, 17/09 20:14 UTC |
| `develop` | `9cddb09e` | **`6f29ad6f`** | pr_merge de `eedsilva`, 18/09 04:14 UTC (tem `gpgsig`) |
| `staging` | `eceb5f8e` | **`3ce6d0d0`** | push de `eedsilva`, 17/09 20:40 UTC |

### Histórico: por que as limpezas anteriores não seguraram

| data | conta | ação |
|---|---|---|
| 2026-08-10 / 08-11 | `Davifs-dev` | force push em `staging` |
| 2026-09-17 17:44–17:51 | `Langestone` | force push em `main`, `develop`, `staging` |
| 2026-09-18 06:03–06:34 | `iapessoastecnologia` | force push em `main`, `develop`, `staging` |

**A causa de a reinfecção sempre voltar:**

1. A organização está no **plano Free** com repositório **privado**. Nesse plano, branch
   protection e rulesets são indisponíveis (a API responde `403 Upgrade to GitHub Pro`).
   Não existe hoje nenhum bloqueio técnico a force push.
2. O repositório tem **6 colaboradores, todos com papel `admin`**: `eedsilva`,
   `Davifs-dev`, `JohanVPS`, `bsantana7`, `Langestone`, `iapessoastecnologia`. Três deles
   aparecem como autores de force push.

Enquanto os dois pontos acima valerem, qualquer limpeza é revertida — foi o que aconteceu
em 10/08, 13/08 e 10/09.

## Fase 0 — Conter (antes de qualquer limpeza)

Limpar antes de conter desperdiça o trabalho. Nesta ordem:

1. **Remover o acesso de escrita das contas envolvidas.** Em Settings → Collaborators and
   teams, rebaixar `iapessoastecnologia`, `Langestone` e `Davifs-dev` para `read`, ou
   removê-las. Só um owner da org consegue.
2. **Auditar as 6 contas admin**: revisar tokens pessoais, chaves SSH e deploy keys de cada
   uma, e revogar o que não for reconhecido. Um force push exige credencial válida — alguma
   delas está comprometida ou sendo usada indevidamente.
3. **Reduzir o número de admins.** Acesso de escrita basta para o trabalho diário; admin
   deve ficar com uma ou duas pessoas.
4. **Habilitar proteção real.** Isso exige uma destas opções:
   - upgrade da org para **Team** (permite branch protection em repo privado); ou
   - tornar o repositório público (não recomendado aqui); ou
   - enquanto nenhuma das duas for possível, tratar `main`/`develop`/`staging` como não
     confiáveis e conferir a integridade a cada `fetch`.

   O repositório já versiona a política pretendida em `.github/security/rulesets-policy.json`,
   validada por `pnpm security:rulesets` — ela só não pode ser aplicada no plano atual.

## Fase 1 — Restaurar as três branches

Pré-requisito: Fase 0 concluída. Use um clone com os objetos legítimos — a árvore de
trabalho local em `~/Documents/Giro/giro-workspace/ia@p/workspace` está limpa (94 / 766).

Confirme cada alvo **antes** de publicar:

```bash
for c in b0d9831e 6f29ad6f 3ce6d0d0; do
  echo "== $c"
  git ls-tree -l "$c" app/postcss.config.js lint-staged.config.mjs
done
# esperado: 94 bytes e 766 bytes em todos
```

Restaure uma branch de cada vez, conferindo entre elas:

```bash
git push --force-with-lease=main:9d9e5a39     origin b0d9831e:main
git push --force-with-lease=develop:9cddb09e  origin 6f29ad6f:develop
git push --force-with-lease=staging:eceb5f8e  origin 3ce6d0d0:staging
```

O `--force-with-lease` com o SHA forjado explícito é deliberado: se alguém publicar outra
coisa nesse intervalo, o push falha em vez de sobrescrever às cegas.

## Fase 2 — Verificar

```bash
git fetch --prune origin
for r in main develop staging; do
  printf '%-9s ' "$r"
  git ls-tree -l "origin/$r" app/postcss.config.js | awk '{print $4}'
done
# esperado: 94 nas três
```

Confirme também pelo CI: o workflow `Supply Chain Integrity` deve voltar a passar nas três
branches. Ele **já estava detectando corretamente** — falhou em `main` e `develop` desde
06:00 UTC de 18/09, e o `success` das 04:14 foi no commit legítimo, antes do force push.

## Fase 3 — As demais branches infectadas

Restam ~632 branches com o payload. Reescrever todas é arriscado e desnecessário. Ordem
sugerida:

1. **Deletar as obsoletas.** A maioria é de PRs já fechadas. Confirme antes de apagar:
   ```bash
   gh pr list --state merged --limit 200 --json headRefName -q '.[].headRefName'
   ```
2. **Reescrever só as branches com trabalho em andamento**, do mesmo jeito da Fase 1.
3. Para inventariar o que sobrou:
   ```bash
   for b in $(git branch -r | grep -v HEAD | sed 's/^ *//'); do
     s=$(git ls-tree -l "$b" app/postcss.config.js 2>/dev/null | awk '{print $4}')
     [ "$s" = "8544" ] && echo "INFECTADA $b"
   done
   ```

Enquanto existirem branches infectadas, **ninguém deve fazer checkout delas e rodar build ou
commit com hooks**.

## Fase 4 — Rotação de segredos

O payload executa durante o build, com acesso ao ambiente. Trate como potencialmente
expostos todos os segredos que passaram por build ou CI desde 2026-08-10:

- `DOCKER_REGISTRY_URL`, `DOCKER_REGISTRY_USERNAME`, `DOCKER_REGISTRY_PASSWORD`
- `VPS_HOST`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_SSH_PASSWORD`
- todos os `ENV_VPS_*` do `scripts/ci/vps-secrets.manifest` (20 entradas), incluindo
  `DATABASE_URL`, `JWT_SECRET`, chaves de criptografia e tokens internos entre serviços
- `GITHUB_AUDIT_LOG_TOKEN`, `GITHUB_ORG_SCANNER_TOKEN`
- chaves de terceiros em `.env.vps.*`: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`

Os arquivos `.env.vps.*` reais na VPS também devem ser reemitidos, não só os segredos do
GitHub.

## Antes de buildar, sempre

Depois de qualquer `fetch`, e antes de `pnpm install`, `build` ou commit com hooks:

```bash
wc -c app/postcss.config.js lint-staged.config.mjs   # esperado: 94 e 766
node --test scripts/supply-chain-security.test.mjs   # detecta os indicadores
```

O hook `pre-commit` já roda esse scanner, e ele detecta o payload atual — confirmado contra
o conteúdo infectado de `origin/develop`, que casa com 5 dos indicadores. O que hooks locais
não fazem é impedir o force push no remoto; só a Fase 0 resolve isso.
