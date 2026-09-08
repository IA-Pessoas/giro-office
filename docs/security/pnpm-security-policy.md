# Política de instalação segura do pnpm

Esta política protege a instalação de dependências do `giro-office` sem executar
scripts de terceiros por padrão e sem adicionar pacotes ao repositório. O
`packageManager` fixa `pnpm@10.26.0`; a configuração usa apenas opções suportadas
por essa versão:

- `minimumReleaseAge: 1440`: aguarda pelo menos um dia antes de aceitar uma
  versão publicada;
- `trustPolicy: no-downgrade` e `blockExoticSubdeps: true`: impedem redução da
  política de confiança e fontes exóticas em dependências transitivas;
- `strictDepBuilds: true`, `dangerouslyAllowAllBuilds: false` e `allowBuilds: {}`:
  nenhum script de build é aprovado sem revisão explícita.

As opções `minimumReleaseAgeStrict` e `trustLockfile` são de versões posteriores
e não aparecem nesta configuração. O verificador falha se elas forem adicionadas,
evitando uma falsa sensação de proteção em pnpm 10.26.

## Verificação

Execute no diretório do repositório:

```text
node scripts/pnpm-security-policy.mjs --root .
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm run security:supply-chain
corepack pnpm run check
```

`--frozen-lockfile` deve falhar quando o manifesto e o lockfile divergem. A
instalação de validação usa `--ignore-scripts`; fixtures que demonstram bloqueio
de scripts nunca devem executar payloads maliciosos.

O harness `node --test scripts/pnpm-security-policy-fixtures.test.mjs` cria
workspaces temporários, invoca exatamente `pnpm@10.26.0` via Corepack com
`COREPACK_ENABLE_NETWORK=0` e usa `--offline`. Ele verifica configuração efetiva de `minimumReleaseAge`, rejeição
estática de idade insegura e fontes git/tarball, mutação rejeitada pelo
`--frozen-lockfile`, lifecycle não aprovado sem alterar um sentinel e um build
mínimo benigno quando o pacote está explicitamente em `allowBuilds`. O sentinel
é apenas um arquivo de evidência; não há payload malicioso, segredo ou acesso ao
registry.

O fixture de lifecycle usa um tarball local temporário apenas para obter um
pacote isolado sem depender de registry. Tarballs e fontes git reais continuam
sendo rejeitados pelo verificador de política. A idade de publicação não é
testada contra o relógio de um registry: o limite offline é coberto pela
configuração efetiva e pelo fixture controlado rejeitado pelo checker, evitando
simular uma resposta de registry.

## Builds aprovados

O mapa `allowBuilds` começa vazio. Uma exceção só pode ser adicionada depois de
uma instalação isolada, revisão humana do manifesto e lockfile e evidência de
que o build é necessário. A documentação da exceção deve registrar pacote,
versão ou intervalo exato, proprietário, motivo, comando de evidência, data da
revisão e data de expiração. Nunca use uma aprovação global equivalente a
`dangerouslyAllowAllBuilds`.

## Pins de confiança (trustPolicy)

O lockfile do repositório era anterior à adoção de `trustPolicy: no-downgrade`,
então qualquer instalação que re-resolvesse o grafo falhava — na prática, ninguém
conseguia adicionar uma dependência. O `--frozen-lockfile` continuava passando
porque não re-resolve nada, o que escondeu o problema.

Cada pacote abaixo teve uma versão publicada **com** attestation de provenance e,
depois, uma versão **sem** nenhuma evidência de confiança. O `no-downgrade`
recusa essa regressão. Os pins abaixo fixam a última versão com provenance:

| Pacote | Pin | Versão recusada | Origem |
| --- | --- | --- | --- |
| `pino` | `9.13.1` | `9.14.0` (2025-10-18, sem provenance) | dependência direta de `shared` |
| `slow-redact` | `0.3.1` | `0.3.2` (2025-10-11, sem provenance) | subdependência do `pino` |
| `reselect` | `5.3.0` | `5.1.1` (2024-06-01, sem provenance) | subdependência do `recharts` |
| `react-redux` | `9.3.0` | `9.2.0` (2024-12-10, sem provenance) | subdependência do `recharts` |

O `app` também passou de `@types/node@^20` para `^25.3.3`, alinhando com o resto
do workspace: a linha 20 arrasta `undici-types@6.21.0`, publicado sem provenance,
enquanto a 25 usa `undici-types@7.x`, que tem.

Para aposentar um pin, confirme que a versão mais nova voltou a publicar com
provenance e remova a entrada de `pnpm.overrides`:

```text
npm view <pacote>@<versão> dist.attestations
```

A revisão desses pins acompanha a revisão trimestral de dependências. Um pin não
é permanente: ele existe só enquanto o pacote não restabelece a evidência de
confiança.

## Escopo de repositórios

O `giro-office` é o projeto pnpm tratado por esta configuração. `nexus` e
`mcp-test` devem ter seu gerenciador, lockfile e política confirmados no próprio
repositório antes de qualquer mudança. Não copie chaves específicas de pnpm
para projetos npm ou yarn; nesses projetos documente o equivalente suportado
pelo gerenciador oficial e valide a instalação congelada correspondente.

## Rollout e revisão

O workflow faz primeiro a checagem estática e depois a instalação congelada sem
scripts. A política deve permanecer obrigatória em pull requests e nos branches
de entrega. Renovate deve resumir a idade de publicação, a origem, o gerenciador,
o lockfile, patches e exceções de build em cada atualização. Exceções são
temporárias, com proprietário e expiração; a revisão de dependências e das
exceções ocorre trimestralmente.

O CI não recebe segredos de produção, deploy ou administração. O `pnpm audit`
pode ser executado separadamente quando o registry estiver disponível; seus
avisos devem ser registrados sem publicar a árvore completa de dependências.
