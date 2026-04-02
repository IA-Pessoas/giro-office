# Plano geral de componentização (UI) — revisão com mentoria

_Idioma: português do Brasil (pt-BR)._

## Pontos fortes (mantidos)

- **Camadas:** `shared/ui` (primitivos sem regra de negócio) vs `shared/components` (composições estáveis reutilizáveis) — padrão escalável.
- **Anti-entropia:** variantes via **CVA** em vez de duplicar strings Tailwind.
- **Migração pragmática:** tratar os **7** arquivos com `chakraShims` de forma incremental, sem big bang.

## Hierarquia de pastas (esclarecimento)

Objetivo: separar **UI pura** de **composição de produto** e de **hooks**.

```text
src/shared
├── ui/                    # Primitivos: Button, Input, Badge — sem chamadas a API
│   └── index.ts           # Barrel — ver ressalvas abaixo
├── components/            # Composições reutilizáveis
│   ├── ui/                # Dialog, Tabs (já existente)
│   ├── layout/            # PageToolbar, shells auxiliares
│   └── data-table.tsx     # (exemplo) quando existir padrão de tabela compartilhado
└── hooks/                 # Hooks compartilhados (já pode existir; manter fora de ui/)
```

**Meta estrutural:** deixar de usar o **nível de pasta** `newLayout` / `new-layout` como container — **o conteúdo dos arquivos permanece**; apenas sobe um nível (ou ganha nome estável, ex. `theme/`), com atualização de imports e do `@source` do Tailwind onde aplicável.

Alvos no repositório (pode ser **um PR por alvo** para reduzir risco):

| Hoje | Depois (conteúdo igual, caminho novo) |
|------|----------------------------------------|
| [app/src/shared/ui/newLayout/](app/src/shared/ui/newLayout/) | arquivos diretamente em `shared/ui/` (ex. `button.tsx`, `input.tsx`, …) |
| [app/src/styles/new-layout/](app/src/styles/new-layout/) | ex. `app/src/styles/theme/` ou arquivos soltos em `styles/`, mantendo `global.css` a apontar para os mesmos `@import` |
| [app/src/shared/components/newLayout/](app/src/shared/components/newLayout/) | ex. `shared/components/layout/` ou outro nome acordado pela equipe (AppShell, Clients, …) |

Após a mudança, imports do tipo `@shared/ui/newLayout/button` passam a `@shared/ui/button` (ou só `@shared/ui` via barrel).

## Fase 0 — Fundações (refinada)

### Barrel `shared/ui/index.ts`

- **Objetivo:** imports estáveis (`@shared/ui`).
- **Riscos:** dependências circulares e **tree-shaking** se o barrel reexportar tudo de um grafo denso.
- **Mitigação:**
  - Exportar apenas arquivos **folha** ou com dependências **estritamente lineares** (ex.: `utils` → `button` não importa `sheet` que importa `button`).
  - Evitar que primitivos importem uns aos outros em ciclos; composições que cruzam vários primitivos ficam em `components/`.
  - Se o empacotador gerar **chunks** grandes, preferir imports **diretos** ao arquivo (ex. `@shared/ui/button`) em código muito quente, mantendo o barrel para a experiência geral de desenvolvimento (DX).

### Tokens e variáveis CSS

- O projeto já centraliza tokens em [app/src/styles/new-layout/theme.css](app/src/styles/new-layout/theme.css) (`--primary`, `--border`, `--destructive`, etc.) e expõe cores ao Tailwind v4 via `@theme inline`. Quando a pasta `styles/new-layout` for eliminada, este arquivo **move-se**; o conteúdo de tokens mantém-se.
- **Diretriz:** novas variantes CVA devem preferir **classes semânticas** (`bg-primary`, `border-border`, `text-destructive`, `bg-card`) em vez de hex ou `gray-700` soltos, sempre que o token existir — alinha **modo escuro** (Fase 5) sem duplicar paleta nos componentes.
- Onde ainda houver `bg-white dark:bg-gray-800` em componentes, ir **convergindo** para tokens conforme esses arquivos forem sendo alterados.

## Fase 2 — FormField (refinada)

- **Evitar** um único `Input` monolítico com dezenas de props.
- **FormField** = composição **rótulo (Label) + controle (Input) + mensagem de erro/ajuda**.
- **React Hook Form:** o `app` **não** declara `react-hook-form` em [package.json](app/package.json) no momento.
  - **Curto prazo:** FormField **controlado** com props explícitas (`error`, `id`, `htmlFor`).
  - **Médio prazo (opcional):** se a equipe **adotar** RHF, evoluir para o padrão **shadcn** (Form + FormField + `FormControl` + contexto de erro) para o input inferir estado de erro sem repetir `hasError` em todo lugar.

## Feedback: toasts (`react-toastify`)

**Situação atual:** o app usa **react-toastify** em vários módulos (`toast.success` / `error` / `warn` / `info`), com **`ToastContainer`** em [_app.tsx](app/src/pages/_app.tsx) e CSS global do pacote. Há uso direto espalhado e, em alguns sítios, adaptadores (ex. [ProjectCreateModal.tsx](app/src/modules/integracao/components/ProjectCreateModal.tsx) mapeando API estilo Chakra para o toastify).

**Objetivos de componentização / padronização:**

1. **API única** — módulo fino em `shared/` (ex. `shared/lib/toast.ts` ou `shared/components/ToastProvider.tsx`) que reexporta funções tipadas (`notifySuccess`, `notifyError`, `notifyWarning`) ou um hook `useAppToast`, para evitar imports diretos de `react-toastify` em dezenas de arquivos e centralizar opções (`position`, `autoClose`, etc.).
2. **Tema claro / escuro** — alinhar aparência dos toasts ao tema da aplicação (variáveis CSS ou `toastClassName` / tema do Toastify), para não ficarem “presos” ao estilo default claro quando `document.documentElement` está em `dark`.
3. **Z-index** — garantir que o container dos toasts entra na **escala documentada** (junto com Dialog/Sheet), para não ficarem atrás de modais ou à frente de forma inconsistente.
4. **Documentação curta** — quando usar `success` vs `error` vs `warning` vs `info` (semântica de feedback), num comentário ou nota interna da equipe.

Esta fase pode ser um **PR dedicado** ou acoplada à Fase 0 (fundamentos) se a equipe quiser fechar tema + z-index de uma vez.

## Fases 1–3 e 4–5

(Mantida a lógica: botões nas listagens do layout novo → `Button` + variantes; `Card` / `Badge` / `PageToolbar` conforme repetição; migração dos 7 arquivos `chakraShims`; Biome + teste manual claro/escuro.)

## Riscos adicionais

### Especificidade e CSS legado

- Migração Chakra/emotion/styled-components → Tailwind pode gerar **conflitos** com regras globais antigas ([global.css](app/src/styles/global.css), módulos CSS).
- **Mitigação:** ao **refatorar** código que ainda depende desses estilos, **inspecionar** sobrescritas; usar `@layer` onde fizer sentido; evitar `!important` salvo exceção documentada.

### Z-index (Dialog, Sheet, sobreposições)

- Hoje o [Dialog](app/src/shared/components/ui/Dialog.tsx) usa `z-[1400]` / `z-[1500]`.
- **Mitigação:** definir uma **escala documentada** (Tailwind `theme.extend` ou tokens) — ex. `z-overlay`, `z-modal`, `z-popover`, `z-toast` — e migrar Dialog/Sheet/tooltips/toasts para essa escala para o **novo** não ficar atrás do legado.

## Ordem de PRs (incremental)

0. **(Opcional primeiro)** Eliminar pastas `newLayout` / `new-layout` conforme tabela acima (só reorganização + imports; sem mudar comportamento).
1. Barrel `shared/ui` (com ressalvas) + **documentar** escala de z-index + uma lista como referência de uso dos primitivos.
1b. (Opcional neste PR ou seguinte) **Toasts:** wrapper/API + tema claro/escuro + z-index do `ToastContainer`.
2. Variantes de botão + segunda lista.
3. `Badge` + status alinhados.
4. `Card` / `FormField` conforme necessidade.
5. Remoção incremental de `chakraShims`.

## Tarefas (checklist)

- [ ] Reorganizar pastas: remover nível `newLayout` / `new-layout` (UI, estilos, componentes de layout), atualizar imports.
- [ ] Barrel `shared/ui` sem ciclos; documentar import direto vs barrel.
- [ ] Documentar escala `z-*` e alinhar Dialog/Sheet e **ToastContainer**.
- [ ] Padronizar toasts: API central (`react-toastify` atrás de um módulo) + aparência no modo escuro.
- [ ] Refatorar botões em 1–2 listagens do layout novo; variantes CVA com tokens semânticos.
- [ ] `Card` + `Badge`; opcional `FormField` (props; RHF depois, se adotado).
- [ ] Migrar 7 arquivos `chakraShims`; reduzir shim.
