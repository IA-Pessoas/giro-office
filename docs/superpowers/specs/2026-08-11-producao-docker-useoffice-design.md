# Design do deploy de produção Docker em useoffice.com.br

## Objetivo

Executar a UI, o gateway e todos os serviços estáveis do Giro Office em uma única stack
Docker de produção nesta máquina, publicada em `https://useoffice.com.br`, sem vincular a
execução ao checkout atualizado por `git pull`.

O deploy pode ter uma janela curta de indisponibilidade durante uma atualização explícita.
Um simples `git pull` não pode reiniciar nem encerrar containers.

## Estado do host e restrições

- Host público: `187.77.48.15`.
- `useoffice.com.br` ainda precisa ter seu registro A alterado do endereço atual para
  `187.77.48.15`.
- `www.useoffice.com.br` permanece como CNAME do domínio raiz.
- O Caddy existente continua sendo o único processo publicado nas portas 80 e 443.
- Nexus e o Supabase local já existentes não podem ser interrompidos pelo deploy.
- O host tem aproximadamente 7,8 GiB de RAM, 3,6 GiB disponíveis no levantamento inicial,
  74 GiB livres em disco e nenhuma swap.
- A produção usa temporariamente o PostgreSQL e o projeto Supabase externos informados pelo
  operador. Uma migração para o Supabase local poderá ocorrer posteriormente por troca de
  configuração e migração de dados, sem redesenhar as imagens.
- Credenciais e segredos nunca serão versionados nem incluídos neste documento.

## Arquitetura

A stack terá um único projeto Compose, `giro-office-production`, contendo:

- UI Next.js (`web`);
- gateway HTTP;
- `organization-service`;
- `user-service`;
- `department-service`;
- `task-service`;
- `project-service`;
- `client-service`;
- `fiscal-service`;
- `contabil-service`;
- `regularize-service`;
- `rh-service`;
- `ti-service`;
- `certificate-service`;
- `pessoal-service`;
- `parcelamento-service`;
- `audit-service`.

Os containers executarão imagens construídas, sem bind mount do código-fonte. Todos terão
política `restart: unless-stopped`. O código poderá ser atualizado no checkout sem alterar a
imagem nem o processo em execução.

Não haverá blue/green neste primeiro deploy. As imagens serão construídas sequencialmente
para reduzir picos de CPU e memória. Será criada uma swap de 4 GiB como proteção operacional,
sem substituir o monitoramento da RAM.

## Rede, domínio e TLS

O Caddy existente será integrado a uma rede Docker compartilhada com a UI do Giro Office. O
gateway e os serviços de domínio permanecerão em redes internas e não serão publicados
diretamente na internet.

O tráfego seguirá este fluxo:

1. `useoffice.com.br` chega ao Caddy nas portas 80/443.
2. O Caddy provisiona TLS automaticamente e encaminha a requisição à UI `web`.
3. A UI atende páginas e ativos.
4. Chamadas do navegador usam o mesmo domínio sob `/api`.
5. O rewrite do Next.js encaminha `/api/*` ao gateway pela rede Docker.
6. O gateway chama os serviços por seus nomes internos no Compose.

`www.useoffice.com.br` redirecionará permanentemente para `https://useoffice.com.br`,
preservando path e query string.

## Configuração e segredos

Serão materializados arquivos `.env.vps.*` locais, já ignorados pelo Git, com permissões
restritas. A conexão PostgreSQL e a chave secreta Supabase fornecidas pelo operador só poderão
ser consumidas por containers backend.

`SUPABASE_SERVICE_ROLE_KEY` nunca será passada como variável `NEXT_PUBLIC_*`, argumento de
build da UI, log ou conteúdo versionado. `SUPABASE_URL` usará a URL HTTPS do projeto, e não a
URL PostgreSQL.

Os segredos internos restantes serão gerados com entropia forte e valores consistentes entre
os consumidores, incluindo JWT, auditoria, chamadas internas e criptografia de dados/arquivos.
As origens permitidas serão limitadas aos dois hosts HTTPS de produção.

## Banco e inicialização

Antes de iniciar a nova versão, o processo de deploy validará a configuração do Compose e a
presença das variáveis obrigatórias. As migrations Prisma serão aplicadas com o procedimento
oficial do repositório e deverão ser compatíveis com a versão que ainda estiver ativa durante
a preparação do deploy.

O deploy construirá todas as imagens antes de substituir qualquer container. Depois do build
bem-sucedido, a stack será recriada e seus endpoints serão aguardados com timeout. Se o build
falhar, a stack ativa não será tocada. Se a inicialização ou os health checks falharem, serão
restauradas as tags/imagens anteriores e a stack anterior será reiniciada.

## Atualizações futuras

O fluxo operacional será explicitamente dividido:

1. `git pull` atualiza somente o checkout.
2. Um comando separado inicia o deploy.
3. O deploy determina o escopo afetado quando possível, constrói antes de recriar e registra a
   última imagem saudável.
4. Mudanças apenas em documentação ou tooling não reiniciam a aplicação.
5. Falhas exibem estado dos containers e logs relevantes, sem imprimir segredos.

Aceita-se downtime curto na troca explícita. Não se aceita indisponibilidade causada apenas
pela atualização do checkout.

## Validação técnica

Antes de expor o domínio, serão executados:

- validação do Compose resolvido;
- build limpo e sequencial das imagens;
- migrations Prisma;
- verificação de que todos os containers esperados estão em execução;
- health/ready checks de cada serviço;
- smoke do gateway e da UI;
- inspeção de logs por crashes, loops de reinício e erros de conexão;
- confirmação de HTTP, HTTPS, redirecionamento de `www` e roteamento `/api`.

## Validação autenticada no navegador

O login do Giro Office usa a tabela `users` e JWT próprio do sistema. O procedimento procurará
um usuário ativo com permissão global/owner sem expor hashes ou dados sensíveis. Se não existir
um usuário adequado, poderá criar a organização, departamentos mínimos, usuário administrador
e permissões pelo modelo oficial do projeto. A senha criada será aleatória e entregue ao
operador no encerramento.

Com uma sessão real, a validação abrirá todos os departamentos e módulos exibidos ao usuário,
incluindo no mínimo Administração, Clientes, Tarefas/Integração, Projetos, RH, Fiscal,
Contábil, Regularize, TI, Certificados, Pessoal e Parcelamento quando presentes no menu.

Para cada módulo serão verificados:

- carregamento da rota;
- ausência de erro fatal ou tela quebrada;
- respostas das chamadas principais da API;
- erros no console do navegador;
- estados básicos de carregamento, erro, vazio ou conteúdo.

Falhas serão registradas com rota, requisição e serviço responsável. Problemas de configuração
ou deploy dentro deste escopo serão corrigidos e o smoke será repetido. Containers apenas no
estado `Up` não satisfazem o critério de conclusão.

## Memória e encerramento

Após todos os serviços estarem estáveis e o smoke autenticado terminar, será feita uma medição
nova contendo:

- RAM total, usada e disponível;
- swap total e usada;
- consumo agregado da stack Giro Office;
- consumo individual de cada container do Giro Office;
- indicação objetiva da margem restante e de eventual pressão de memória.

O relatório final diferenciará claramente o que está em execução, o que foi validado no
navegador, eventuais limitações remanescentes e qualquer ação externa ainda necessária, como
propagação do DNS.
