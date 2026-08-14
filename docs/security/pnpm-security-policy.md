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

## Builds aprovados

O mapa `allowBuilds` começa vazio. Uma exceção só pode ser adicionada depois de
uma instalação isolada, revisão humana do manifesto e lockfile e evidência de
que o build é necessário. A documentação da exceção deve registrar pacote,
versão ou intervalo exato, proprietário, motivo, comando de evidência, data da
revisão e data de expiração. Nunca use uma aprovação global equivalente a
`dangerouslyAllowAllBuilds`.

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
