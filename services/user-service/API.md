# User Service - API Documentation

Base URL: `http://localhost:3335` (ou via gateway)

Todas as respostas de sucesso seguem o formato:
```json
{
  "success": true,
  "data": { ... }
}
```

---

## Health

### GET /health

Verifica se o serviço está em execução.

**Autenticação:** Não requerida

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "user-service"
  }
}
```

---

## Auth

### POST /session

Realiza login e retorna token JWT.

**Autenticação:** Não requerida (rota pública)

**Body (JSON):**
| Campo    | Tipo   | Obrigatório | Descrição |
|----------|--------|--------------|-----------|
| login    | string | Sim          | Login do usuário |
| password | string | Sim          | Senha |

**Exemplo:**
```json
{
  "login": "usuario@email.com",
  "password": "senha123"
}
```

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Nome",
    "login": "usuario@email.com",
    "permission": 2,
    "department_id": "uuid",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "service": "user-service"
  }
}
```

**Erros:** `401` - Login/senha incorretos ou usuário inexistente

---

### POST /start-config

Cria o primeiro usuário admin do sistema (quando o banco está vazio).

**Autenticação:** Não requerida (rota pública)

**Body:** Nenhum

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "Admin",
      "login": "Admin",
      "permission": 2,
      "department_id": "uuid"
    },
    "service": "user-service"
  }
}
```

**Erros:** `409` - Login já cadastrado; `400` - Execute o seed do banco antes

---

### GET /me

Retorna os dados do usuário autenticado.

**Autenticação:** Obrigatória (header `x-forwarded-auth-user-id` enviado pelo gateway)

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Nome",
    "login": "usuario@email.com",
    "permission": 2,
    "status": "active",
    "department_id": "uuid",
    "photo_url": "https://...",
    "joined_at": "2024-01-01T00:00:00.000Z",
    "organization_id": "uuid",
    "type": "owner",
    "first_owner_flag": true,
    "permission_id": "uuid",
    "service": "user-service"
  }
}
```

**Erros:** `401` - Não autenticado

---

## Users

### GET /users

Lista usuários com paginação.

**Autenticação:** Obrigatória

**Query params:**
| Parametro | Tipo   | Obrigatório | Default | Descrição |
|-----------|--------|--------------|---------|-----------|
| skip      | number | Não          | 0       | Registros a pular |
| take      | number | Não          | 20      | Registros por página |

**Exemplo:** `GET /users?skip=0&take=10`

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "users": [ ... ],
    "total": 100,
    "skip": 0,
    "take": 10
  }
}
```

---

### GET /users/:id

Busca usuário por ID.

**Autenticação:** Obrigatória

**Path params:**
| Parametro | Tipo   | Descrição |
|-----------|--------|-----------|
| id        | string | UUID do usuário |

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Nome",
    "login": "usuario@email.com",
    "permission": 2,
    "status": "active",
    "department_id": "uuid",
    "photo_url": "https://...",
    "joined_at": "2024-01-01T00:00:00.000Z",
    "organization_id": "uuid",
    "type": "owner",
    "first_owner_flag": true,
    "permission_id": "uuid"
  }
}
```

**Erros:** `404` - Usuário não encontrado

---

### POST /users

Cria um novo usuário.

**Autenticação:** Obrigatória (minPermission: 2 no gateway)

**Body (JSON):**
| Campo           | Tipo    | Obrigatório | Descrição |
|-----------------|---------|-------------|-----------|
| name            | string  | Sim         | Nome do usuário |
| login           | string  | Sim         | Login (único) |
| password        | string  | Sim         | Senha |
| department_id   | string  | Sim         | UUID do departamento |
| permission      | number  | Sim         | Nível de permissão (0, 1, 2, 3) |
| status          | string  | Não         | `active` ou `inactive` (default: `active`) |
| photo_url       | string  | Não         | URL da foto |
| invited_by      | string  | Não         | UUID do usuário que convidou |
| organization_id | string  | Condicional | UUID da organização (obrigatório se `type` ou `modules` forem enviados) |
| type            | string  | Não         | `owner`, `admin` ou `user` |
| first_owner_flag| boolean | Não         | `true` apenas quando `type` é `owner` |
| modules         | object  | Não         | Permissões por módulo (ex: `{ "atendimento": 2, "fiscal": 1 }`) |

**Regras de validação:**
- `organization_id` é obrigatório quando `type` ou `modules` forem enviados
- `type` deve ser `admin`, `owner` ou `user`
- `first_owner_flag` só pode ser `true` quando `type` for `owner`
- `owner` recebe acesso total a todos os módulos automaticamente
- `admin` e `user` usam o objeto `modules` para permissões granulares

**Exemplo (usuário sem organização):**
```json
{
  "name": "João Silva",
  "login": "joao@email.com",
  "password": "senha123",
  "department_id": "uuid-do-departamento",
  "permission": 1
}
```

**Exemplo (usuário owner):**
```json
{
  "name": "Dono",
  "login": "dono@email.com",
  "password": "senha123",
  "department_id": "uuid-do-departamento",
  "permission": 2,
  "organization_id": "uuid-da-organizacao",
  "type": "owner",
  "first_owner_flag": true
}
```

**Exemplo (usuário com módulos específicos):**
```json
{
  "name": "Operador",
  "login": "operador@email.com",
  "password": "senha123",
  "department_id": "uuid-do-departamento",
  "permission": 1,
  "organization_id": "uuid-da-organizacao",
  "type": "user",
  "modules": {
    "atendimento": 2,
    "fiscal": 1,
    "comercial": 0
  }
}
```

**Resposta:** `201 Created`

**Erros:** `400` - Validação; `409` - Login já cadastrado

---

### PATCH /users/:id

Atualiza um usuário existente.

**Autenticação:** Obrigatória

**Path params:**
| Parametro | Tipo   | Descrição |
|-----------|--------|-----------|
| id        | string | UUID do usuário |

**Body (JSON):** Todos os campos são opcionais (apenas os enviados serão atualizados)
| Campo           | Tipo    | Descrição |
|-----------------|---------|-----------|
| name            | string  | Nome |
| login           | string  | Login |
| password        | string  | Nova senha (será hasheada) |
| department_id   | string  | UUID do departamento |
| permission      | number  | Nível de permissão |
| status          | string  | `active` ou `inactive` |
| photo_url       | string \| null | URL da foto ou `null` para remover |
| organization_id | string \| null | UUID da organização |
| type            | string \| null | `owner`, `admin` ou `user` |
| first_owner_flag| boolean | `true` apenas quando `type` é `owner` |
| modules         | object  | Permissões por módulo |

**Resposta:** `200 OK`

**Erros:** `400` - Validação; `404` - Usuário não encontrado; `409` - Login já cadastrado

---

### POST /users/:id/photo

Faz upload da foto do usuário.

**Autenticação:** Obrigatória

**Path params:**
| Parametro | Tipo   | Descrição |
|-----------|--------|-----------|
| id        | string | UUID do usuário |

**Body (multipart/form-data):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| file  | File | Sim         | Imagem (JPEG, PNG ou WebP, máx. 5MB) |

**Exemplo (curl):**
```bash
curl -X POST "http://localhost:3335/users/SEU_USER_ID/photo" \
  -F "file=@/caminho/para/foto.jpg"
```

**Resposta:** `200 OK` - Usuário atualizado com `photo_url`

**Erros:** `400` - Arquivo não enviado ou tipo inválido; `404` - Usuário não encontrado; `500` - Erro no Supabase

**Nota:** O gateway não encaminha multipart corretamente. Use chamada direta ao user-service (porta 3335) para upload.

---

### DELETE /users/:id/photo

Remove a foto do usuário (Supabase Storage + banco).

**Autenticação:** Obrigatória

**Path params:**
| Parametro | Tipo   | Descrição |
|-----------|--------|-----------|
| id        | string | UUID do usuário |

**Body:** Nenhum

**Resposta:** `200 OK` - Usuário atualizado com `photo_url: null`

**Erros:** `404` - Usuário não encontrado

---

### DELETE /users/:id

Desativa um usuário (soft delete).

**Autenticação:** Obrigatória

**Path params:**
| Parametro | Tipo   | Descrição |
|-----------|--------|-----------|
| id        | string | UUID do usuário |

**Body:** Nenhum

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "message": "Usuário desativado com sucesso."
  }
}
```

**Erros:** `404` - Usuário não encontrado; `409` - Usuário possui vínculos

---

## Permissions

### GET /permission/:userId

Busca as permissões de um usuário.

**Autenticação:** Obrigatória

**Path params:**
| Parametro | Tipo   | Descrição |
|-----------|--------|-----------|
| userId    | string | UUID do usuário |

**Query params:**
| Parametro | Tipo   | Obrigatório | Descrição |
|-----------|--------|-------------|-----------|
| modulo    | string | Não         | Filtra apenas um módulo (ex: `atendimento`) |

**Exemplo:** `GET /permission/uuid-do-usuario?modulo=atendimento`

**Resposta:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "organization_id": "uuid",
    "atendimento": 2,
    "certificado": 0,
    "comercial": 1,
    ...
  }
}
```

**Erros:** `400` - userId ausente; `404` - Permissão não encontrada

---

### PUT /permission/:userId

Atualiza as permissões de um usuário.

**Autenticação:** Obrigatória (minPermission: 2 no gateway)

**Path params:**
| Parametro | Tipo   | Descrição |
|-----------|--------|-----------|
| userId    | string | UUID do usuário |

**Body (JSON):** Objeto com chaves = nome do módulo, valor = nível (0, 1 ou 2)
| Módulos suportados |
|--------------------|
| atendimento, certificado, comercial, contabil, financeiro, fiscal, integracao, marketing, parcelamento, pec, pessoal, regularize, rh, triagem, wiki |

**Níveis de permissão:**
- `0` - Sem acesso
- `1` - Leitura
- `2` - Leitura e escrita

**Exemplo:**
```json
{
  "atendimento": 2,
  "fiscal": 1,
  "comercial": 0
}
```

**Resposta:** `200 OK` - Objeto de permissão atualizado

**Erros:** `400` - Validação; `404` - Usuário não possui permissão

---

## Códigos de erro

| Código | Descrição |
|--------|-----------|
| 400 | Bad Request - Validação falhou |
| 401 | Unauthorized - Não autenticado |
| 403 | Forbidden - Não autorizado |
| 404 | Not Found - Recurso não encontrado |
| 409 | Conflict - Conflito (ex: login duplicado) |
| 500 | Internal Server Error - Erro interno |
