# XLS sintético de Contingência

`synthetic.xls` é BIFF8, primeira planilha `Balancete`. Gerado por
`contingencyXls(contingencyRows())` de
`services/contabil-service/src/test/contingencyFixtures.ts`, trocando a primeira
linha por uma linha vazia. Não contém dados de cliente real nem macros.
O smoke usa o cliente sintético criado na própria execução; por isso esta
planilha não fixa um CNPJ. O resultado deve indicar identidade `not_found`.
Os testes de serviço cobrem também CNPJ identificado e divergente.

| Rótulo | Célula do rótulo | Célula do valor | Valor em reais |
| --- | --- | --- | --- |
| RECEITA BRUTA DE VENDAS E SERVIÇOS | I2 | U2 | 100.000,00 |
| BANCOS CONTA MOVIMENTO | J3 | S3 | 180.000,00 |
| DUPLICATAS A RECEBER | J4 | U4 | 120.000,00 |
| EMPRESTIMOS DE TERCEIROS | J5 | U5 | 20.000,00 |
| ADIANTAMENTO A SÓCIOS | J6 | U6 | 5.000,00 |
| CAIXA GERAL | K7 | U7 | 3.000,00 |
| EMPRÉSTIMOS | J8 | U8 | 10.000,00 |

A 11%: diferença R$ 80.000,00; transferências internas R$ 22.000,00;
base mínima R$ 20.000,00, total mínimo R$ 3.982,00; base máxima R$ 48.000,00,
total máximo R$ 9.556,80. Multa de 75% e juros de 6% sobre o tributo.
