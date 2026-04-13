# Visão Geral do Castelo Workspace (CW) 

## 0. Documentação
1. Visão Geral do Sistema - readme.md
2. Diagrama de Arquitetura - Draw.io
3. Documentação de API - Postman
4. Diagrama de Esquema do Banco de Dados - Draw.io
5. Diagrama de Casos de Uso 
x6. Diagrama de Sequência
x7. Documentação de configuração

## 1. Próposito
O CW é uma plataforma web interna projetada para centralizar e otimizar o gerenciamento de projetos da nossa empresa. O objetivo é substituir planilhas e trocas de e-mail desorganizadas por um fluxo de trabalho unificado, aumentando a produtividade e a visibilidade sobre o andamento das entregas.

## 2. Usuários Principais
* **Colaborador:** Funcionário que executa e atualiza o status das tarefas que lhe são atribuídas.
* **Gerente de Projetos:** Responsável por criar projetos, definir tarefas, atribuir responsáveis e acompanhar o progresso geral.
* **Administrador:** Gerencia usuários, permissões e configurações gerais do sistema.

## 3. Módulos e Funcionalidades Chave
* **Gestão de Clientes:** Cadastro e consulta de informações dos clientes, assim como toda gestão de prospecção, do grupo, do Plano adaptativo dos mesmos.
* **Gestão de Projetos:** Criação de projetos vinculados a um cliente, com data de início, suas tarefas e fim.
* **Gestão de Tarefas:** Criação, atribuição, e atualização de status de tarefas dentro de um projeto.
* **Gestão Agenda:** Criação de agendamentos ou tarefas para melhor organização central.
* **Autenticação e Permissões:** Controle de acesso baseado no tipo de usuário.
* **Notificações:** Envio de e-mails para avisos importantes (ex: cliente novo).
* **Relatórios:** Relatórios em um modelo padrão para poder exportar informações do sistema de forma organizada e pré definida.

## 4. Arquitetura Tecnológica
* **Frontend:** Aplicação em **React com TypeScript**.
* **Backend:** API RESTful construída em **Node.js com Express e TypeScript**.
* **Banco de Dados:** **PostgreSQL**.
* **ORM:** **Prisma**.