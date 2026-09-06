# Coordenar a criação assistida de projetos no task-service

O `task-service` coordenará a criação do projeto, das tarefas confirmadas e de suas dependências em
uma única transação, reutilizando o núcleo de criação de projeto em vez de duplicar suas regras. A
atomicidade cobre os dados do projeto e das tarefas; a auditoria continua pós-commit e best-effort,
como nos fluxos atuais.
