# Arquitetura de Frontend: Feature-Based Modules

## Visao Geral

Este projeto utiliza uma arquitetura baseada em Dominios (Modules) e Modulos. O objetivo e garantir o baixo acoplamento entre as funcionalidades de negocio (micro-servicos no backend) e alta coesao interna.

## Estrutura de Pastas

```
src/
├── modules/          # Dominios de negocio isolados (Ex: auth, chat, sales)
├── shared/           # Infraestrutura e UI agnostica (UI Kit, API, Utils)
├── pages/            # Rotas do Next.js (Orquestradores de Modules)
└── styles/           # Design System Global
```

## Regras de Dependencia (Crucial)

Para manter a escalabilidade, seguimos a hierarquia de camadas:

- **Pages → Modules**: As paginas importam componentes e servicos dos modules.
- **Modules → Shared**: Os modules utilizam ferramentas e componentes globais do shared.
- **Modules ↛ Modules**: Um module nunca deve importar arquivos internos de outro module.
  - **Solucao**: Se Chat precisa de dados de User, passe via Props na Page ou mova a entidade para `@shared/types`.
- **Shared ↛ Modules**: O codigo compartilhado deve ser "burro" em relacao ao negocio. Ele nao conhece os modules.

**Regra de Ouro**: Se voce esta em `@modules/A` e sente que precisa importar algo de `@modules/B`, pare. Ou voce passa o dado via Props, ou esse 'algo' deve ser promovido para `@shared`.

## Anatomia de um Module (@modules/)

Cada pasta dentro de `features/` deve ser tratada como um mini-app:

- `components/`: UI especifica deste dominio.
- `hooks/`: Logica de estado e efeitos deste dominio.
- `services/`: Encapsulamento de chamadas a API (ex: `userService.ts`).
- `types/`: Interfaces e tipos exclusivos do dominio.
- `index.ts` (Public API): O unico ponto de saida. So exportamos o que o resto do app pode ver.

**IMPORTANTE**: Nunca importe de `@features/domain/components/X`. Importe sempre de `@features/domain`.

## Guia de Decisao: Onde colocar meu codigo?

| Pergunta | Destino |
|----------|---------|
| E um botao, input ou modal generico? | `shared/components/` |
| E uma chamada de API de um micro-servico? | `features/[domain]/services/` |
| E um formatador de data usado em todo o app? | `shared/utils/` |
| E um tipo que 3+ features utilizam? | `shared/types/` |
| E a logica de um formulario especifico? | `features/[domain]/hooks/` |

## Fluxo de Desenvolvimento

1. **Criacao**: Ao adicionar uma nova funcionalidade, crie uma nova pasta em `features/`.
2. **Encapsulamento**: Mantenha o maximo de logica possivel dentro da pasta da feature.
3. **Promocao**: Se perceber que um componente de uma feature esta sendo copiado para outra, "promova-o" para a pasta `shared/`.

## Exemplo de Uso

### Importando de uma Feature

```typescript
// Correto
import { UserList, userService, type UserItem } from '@features/users';

// Errado
import { UserList } from '@features/users/components/UserList';
```

### Passando Dados entre Features

```typescript
// Na Page (orquestrador)
import { ChatUserList } from '@features/chat';
import { userService } from '@features/users';

const users = await userService.list();
<ChatUserList users={users} />
```

### Criando uma Nova Feature

1. Criar estrutura de pastas em `features/[nome-da-feature]/`
2. Definir tipos em `types/index.ts`
3. Criar service em `services/[nome]Service.ts`
4. Criar componentes em `components/`
5. Exportar tudo via `index.ts`
