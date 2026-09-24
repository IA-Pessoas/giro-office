# CPF mascarado nas listas de colaboradores; detalhe e clientes continuam completos

Listas que mostram colaboradores exibem o CPF mascarado (`***.444.777-**`, via `maskCPF` em `app/src/shared/utils/formatters.ts`); hoje isso vale para a lista de Termos de Tecnologia (#1344). O CPF completo continua no detalhe, que é aberto por escolha de quem consulta, na impressão do termo e na busca. A API ainda devolve o CPF inteiro, porque essas telas precisam dele.

## Considered Options

- **Mascarar também os CPFs de clientes e sócios** (certificados PF, Departamento Pessoal, Regularize): rejeitado por ora. A operação contábil usa esses documentos para identificar o cliente em cada tela.
- **Mascarar na API**: exigiria um endpoint de detalhe separado para o CPF completo. Fica para quando houver lista de colaboradores fora do Termos.

## Consequences

- Toda lista nova de colaboradores deve usar `maskCPF`.
- Quem precisa do CPF completo abre o detalhe, e esse acesso segue as regras de permissão do módulo.
