# Adaptador de e-mail do Comercial

## Estado

O `commercial-service` já envia notificações de fechamento ao adaptador HTTP e repete falhas pela outbox. O workflow N8N e sua URL de webhook já existem fora deste repositório. Este PR não altera nem chama o endpoint. O export anteriormente disponível para análise estava inativo e usava um formato antigo de payload; portanto, ele não comprova que o workflow publicado atende ao contrato atual. É necessário verificar o workflow atual, a autenticação, a idempotência persistente, a configuração segura da VPS e o procedimento de reprocessamento antes de concluir a validação ponta a ponta.

## Contrato HTTP

O serviço envia `POST` para `COMMERCIAL_EMAIL_ADAPTER_URL`, sempre por HTTPS em produção, com `Content-Type: application/json` e estes cabeçalhos:

| Cabeçalho | Conteúdo |
| --- | --- |
| `x-internal-service-token` | Token compartilhado configurado fora do workflow exportado |
| `idempotency-key` | `event_id` estável da transição comercial |

O corpo tem exatamente este formato:

```json
{
  "from": "comercial@example.test",
  "recipients": [
    { "email": "destino@example.test", "name": "Destino" }
  ],
  "subject": "CLIENTE NOVO - Empresa",
  "html": "<p>2026-10</p>"
}
```

Os endereços `.example.test` são ilustrativos. `from` vem de `COMMERCIAL_EMAIL_FROM`; destinatários são os e-mails habilitados para envio de cliente novo na organização. O serviço só notifica o fechamento elegível de cliente novo e considera a chamada concluída quando recebe qualquer resposta HTTP 2xx. Resposta não 2xx, timeout ou erro de rede são falhas reprocessáveis.

## Requisitos para o workflow N8N

1. Receber somente `POST` no caminho de webhook aprovado e validar o token de serviço antes de processar o corpo. Recusar token ausente/inválido com não 2xx.
2. Validar o corpo e usar `idempotency-key` como chave persistente. A persistência precisa sobreviver a reinícios e impedir duas execuções simultâneas da mesma chave. Guardar estado suficiente para reconhecer uma aceitação anterior e reconciliar uma tentativa ambígua. Rejeitar com não 2xx o reaproveitamento da mesma chave com corpo diferente.
3. Enviar ao provedor aprovado usando `from`, `recipients`, `subject` e `html` sem mudar destinatários ou conteúdo.
4. Retornar 2xx somente depois de o provedor confirmar que aceitou a mensagem. Em retry de chave já aceita, retornar 2xx sem enviar de novo. Falha confirmada antes da aceitação deve retornar não 2xx.
5. Se a conexão cair depois de o provedor aceitar e antes de o N8N responder, não enviar cegamente outra mensagem. Reconciliar a chave com o provedor ou encaminhar para conferência operacional; manter a tentativa não confirmada sem responder 2xx até saber o resultado. Se o provedor não permitir reconciliação, a operação precisa resolver o estado ambíguo antes de liberar novo envio.
6. Não registrar o token, os endereços ou o HTML do e-mail em logs de execução. O token deve ficar no cofre de credenciais do N8N e ser referenciado pelo workflow sem valor embutido; exportações não podem conter segredos.

A persistência de `commercial.email_notifications` protege o processamento no serviço e usa `event_id` único. Ela não substitui a persistência do N8N: o serviço não consegue saber se o provedor aceitou uma mensagem quando perdeu a resposta HTTP.

## Configuração e rotação

Configure no gestor de segredos do `commercial-service`:

- `COMMERCIAL_EMAIL_ADAPTER_URL`: URL HTTPS do webhook de produção;
- `COMMERCIAL_EMAIL_ADAPTER_TOKEN`: mesmo token interno cadastrado como credencial no N8N;
- `COMMERCIAL_EMAIL_FROM`: endereço remetente válido e autorizado pelo provedor;
- `COMMERCIAL_EMAIL_ADAPTER_TIMEOUT_MS`: timeout da chamada, em milissegundos (padrão `10000`).

Em produção, URL, token e remetente são obrigatórios. Não use valores reais em arquivos versionados, exportações N8N, exemplos, logs ou argumentos de linha de comando. Para rotacionar o token, atualize o segredo no N8N e no serviço em uma janela coordenada, reinicie o serviço conforme o procedimento de deploy e confirme uma chamada de validação sem expor o valor. O serviço aceita um token por vez.

## Operação e reprocessamento

A outbox tenta novamente falhas com espera exponencial: padrão de cinco tentativas, base de um segundo, limitada a sessenta segundos. Ajuste por `COMMERCIAL_OUTBOX_WORKER_MAX_ATTEMPTS` e `COMMERCIAL_OUTBOX_WORKER_RETRY_BASE_MS`. A notificação mantém o mesmo `event_id` em todas as tentativas; o serviço registra status, quantidade de tentativas e erro, e não reivindica notificações já enviadas ou ainda processadas.

`GET /commercial/outbox/status` mostra contagens e a falha recente entre os cinquenta eventos mais recentes da organização. A rota não reprocessa eventos. Este serviço não oferece endpoint público de reprocessamento manual. Antes de qualquer replay operacional, confirme no N8N/provedor se a mensagem foi aceita, preserve o `event_id` original e use apenas um procedimento interno aprovado; não altere tabelas diretamente. Esse procedimento precisa ser definido antes da entrada em produção.

## Verificações locais

Os testes de contrato e configuração ficam em `src/test/commercialEmailAdapter.test.ts` e `src/test/commercialServiceEnv.test.ts`. Para executá-los no pacote:

```bash
cd services/commercial-service
node node_modules/vitest/vitest.mjs run src/test/commercialEmailAdapter.test.ts src/test/commercialServiceEnv.test.ts
```

Eles verificam o JSON, os cabeçalhos de autenticação/idempotência, o tratamento de não 2xx e a exigência de remetente explícito em produção. Um teste de integração real ainda depende de N8N, provedor e segredos de teste aprovados; não use o webhook de produção para validar a configuração.
