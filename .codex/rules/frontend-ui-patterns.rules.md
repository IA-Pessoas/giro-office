# Regras de Frontend

Fonte original: `.cursor/rules/frontend-ui-patterns.mdc`, expandida para Codex.

## Revisão Antes de Bridge ou Módulo Grande

- Antes de fechar uma bridge ou entrega frontend grande, revisar issues e PRs recentes relevantes de frontend.
- Transformar em regra apenas problemas recorrentes, caros ou objetivamente revisáveis.
- Não transformar bug único em regra permanente sem evidência de repetição.
- Em bridge final, aplicar Ponytail Full: remover bloat claro e código desnecessário sem remover segurança, validação, permissões, estados de erro/loading ou smoke checklist.

## Simplicidade e Redundância

- Antes de criar helper, hook, tipo, componente ou constante compartilhada, procurar padrão equivalente no domínio e em `app/src/shared`.
- Reutilizar helpers compartilhados existentes quando o comportamento for o mesmo.
- Criar helper novo apenas quando houver repetição real, regra de domínio compartilhada ou risco claro de divergência.
- Evitar abstração para caso único, configuração "para depois" e wrappers que apenas renomeiam API existente.
- Remover código morto, mocks antigos, flags sem uso e alternativas obsoletas quando a entrega substituir o fluxo.

## Padrões Visuais Compartilhados

- Evitar estilos visuais inline em componentes de tela ou feature, incluindo `style={...}` e constantes locais criadas apenas para controlar apresentação.
- Padrões visuais recorrentes devem ser extraídos para componentes compartilhados, wrappers ou módulos de UI no nível do domínio.
- Elementos nativos customizados (`select`, `input`, `textarea`, etc.), quando repetidos, devem usar componente base ou classes/tokens exportados do domínio.
- Quando um detalhe visual exigir `style`, ele deve ficar encapsulado apenas no componente base responsável por aquele padrão.
- Telas e componentes de feature devem consumir componentes de UI compartilhados ou módulo de formulário do domínio, em vez de recriar localmente o mesmo padrão visual.

## Padrões Visuais do App

- Seguir o estilo já usado no módulo antes de introduzir variação visual nova.
- Preferir Tailwind/classes compartilhadas e componentes existentes do projeto.
- Não expandir uso de `styled-components`, Emotion ou shims legados em telas novas, salvo manutenção pontual em arquivo que já usa esse padrão.
- Cards, painéis, tabelas, estados vazios, badges e botões devem manter densidade visual compatível com o restante do app.
- Evitar landing page ou tela intermediária quando o fluxo esperado for uma ferramenta, dashboard ou redirecionamento.

## Abas de Módulos

- Abas internas de departamento devem seguir o padrão compacto e centralizado já usado nos módulos existentes.
- Usar `role="tablist"` e `role="tab"` quando a interação representar abas reais.
- Manter ícone, label curta, estado ativo claro e espaçamento estável.
- Evitar abas largas, desalinhadas ou com aparência diferente dentro do mesmo grupo de módulos.

## Botões e Ações

- CTA visível precisa executar ação real, abrir fluxo real ou estar explicitamente desabilitado com motivo claro.
- Não deixar botão "em breve", `console.log`, handler vazio ou ação simulada em fluxo principal.
- Usar botão compacto e estilo compatível com modais/popups existentes quando a ação estiver dentro de diálogo.
- Preferir ícones de biblioteca instalada para ações comuns quando o padrão local já usar ícone.

## Popups e Modais

- Preferir o `Dialog` compartilhado ou padrão Radix já existente para novos modais.
- Modais devem ser compactos, focados na ação e sem texto explicativo excessivo.
- Não usar modal manual quando o componente compartilhado atende ao caso.
- Garantir fechamento por ação explícita, `Esc`/overlay quando o padrão local permitir, e estados de loading/erro.

## Seleção de Responsáveis

- Quando o campo representar responsável departamental, listar usuários do departamento relacionado ao contexto da tela como comportamento padrão.
- Não exibir usuários de outros departamentos, salvo requisito funcional explícito, permissão administrativa ou vínculo legado já existente.
- Sempre que possível, filtrar na origem dos dados, evitando carregar usuários desnecessários para filtrar apenas no frontend.
- O responsável atualmente vinculado ao registro deve permanecer visível e selecionável durante edição quando necessário para preservar dados existentes.

## Dados Reais e Mocks

- Não manter mock em fluxo principal quando já existe contrato real ou serviço do domínio.
- Se mock temporário for inevitável, isolar e sinalizar claramente a remoção esperada.
- Ao substituir mock por API real, remover fallback falso que possa mascarar erro de integração.
- Estados de loading, erro, vazio e sucesso devem refletir o estado real da requisição.

## React Query e Estado Remoto

- Usar React Query para dados remotos cacheáveis quando o domínio já usa esse padrão.
- Centralizar query keys em helpers do domínio quando houver múltiplas queries relacionadas ou necessidade de reutilização.
- Invalidar ou atualizar cache após mutações que alterem dados visíveis.
- Evitar duplicar o mesmo estado remoto em `useState` quando a query já representa a fonte de verdade.

## Campos Sensíveis

- Senhas, tokens, cookies, segredos e dados sensíveis devem ficar mascarados por padrão.
- Exibição ou cópia de segredo precisa ser ação explícita do usuário.
- Não registrar segredo em `console`, toast, erro serializado ou estado persistido.

## Formulários

- Reutilizar classes/componentes de formulário do domínio quando existirem.
- Manter labels, mensagens de erro, disabled/loading e validações coerentes com o restante do módulo.
- Não duplicar strings longas de classe para reproduzir input/select já padronizado.
- Preservar dados existentes durante edição, especialmente quando há vínculos legados.

## Tipagem

- Evitar `any` em contratos de API, payloads, permissões e dados de formulário.
- Preferir tipos do domínio ou contratos compartilhados quando existirem.
- Não enfraquecer tipo para contornar erro; ajustar a origem ou normalizar no limite do dado.

## Performance e Manutenção

- Usar `next/image` quando a imagem for estática ou rastreável e o padrão do app permitir.
- Usar import dinâmico para bibliotecas pesadas em telas onde isso já é padrão ou reduz custo inicial real.
- Limpar timers, subscriptions e listeners em `useEffect`.
- Evitar recalcular listas grandes, filtros ou agrupamentos em render quando `useMemo` simples resolver.
