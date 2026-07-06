Fonte original: .cursor/rules/frontend-ui-patterns.mdc

Metadados originais do Cursor:
System.Object[]

# Padrões de UI no Frontend

## Padrões visuais compartilhados

- Evitar estilos visuais inline em componentes de tela ou feature, incluindo `style={...}` e constantes locais criadas apenas para controlar apresentação.
- Padrões visuais recorrentes devem ser extraídos para componentes compartilhados, wrappers ou módulos de UI no nível do domínio, em vez de serem redefinidos em várias telas.
- Elementos nativos com apresentação customizada (`select`, `input`, `textarea`, etc.), quando o mesmo padrão visual aparecer em mais de um lugar, devem usar uma implementação compartilhada do domínio: um componente base (ex.: `ClientNativeSelect`) ou classes/tokens exportados de um único módulo de formulário do domínio (ex.: `clientFormControls.ts`), desde que a tela não duplique strings de classe nem `style` apenas para reproduzir o mesmo controle.
- Quando um detalhe visual realmente exigir `style`, ele deve ficar encapsulado apenas no componente base compartilhado responsável por aquele padrão, nunca espalhado nas telas da feature.

## Uso nas features

- Telas e componentes de feature devem consumir componentes de UI compartilhados ou o módulo de formulário do domínio, em vez de recriar localmente o mesmo padrão visual.
- Quando um domínio já possuir controles compartilhados de formulário, deve-se preferir estender essa camada compartilhada em vez de introduzir novo styling local.

## Exemplo (domínio `clients`)

- Controles de formulário alinhados à marca: `app/src/modules/clients/form/clientFormControls.ts` (`clientTextFieldClassName`, `clientTextareaClassName`).
- `select` nativo estilizado (seta, foco, etc.): `app/src/modules/clients/form/ClientNativeSelect.tsx` — qualquer `style` necessário fica só nesse wrapper; as features importam o componente.

