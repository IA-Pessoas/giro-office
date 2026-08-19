# ADR 0002: Adaptadores de relatórios por domínio

## Status

Aceita.

## Contexto

O motor de relatórios precisa compor fontes aprovadas sem assumir a fronteira
de autorização ou o armazenamento de cada domínio.

## Decisão

O `reports-service` persiste definição, modelo, job, snapshot, retenção e
auditoria. Cada serviço de domínio possui seu catálogo, aplica tenant e grant,
e seleciona as linhas e os campos retornados.

O motor e o navegador não aceitam SQL, nome de tabela de domínio, expressão
livre, URL upstream ou endpoint público genérico. A integração ocorre somente
por adaptadores internos autenticados, com `x-request-id`, timeout de 10
segundos por adaptador, conforme ADR 0001, e diagnósticos seguros. Chaves são
usadas apenas para relações internas.

No Gate G1, os únicos adaptadores liberados são Parcelamento (#811) e
Integração (#812).

## Consequências

O domínio mantém a decisão de acesso e projeção de dados. O motor recebe
somente contratos internos aprovados e não expõe uma superfície genérica de
consulta.
