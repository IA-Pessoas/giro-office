# XLSX sintético do comparador Veri

`synthetic.xlsx` tem uma planilha, `Clientes`, no layout que o `relatorios/veri.php` do
legado lia: dados da linha 3 em diante, razão social na coluna A e CNPJ na coluna C.
Foi gerado com `@e965/xlsx` (`utils.aoa_to_sheet` + `write`), como o `veriWorkbook` de
`services/regularize-service/src/test/veriFixtures.ts`. Não contém dados de cliente real
nem macros.

| Linha | A | B | C |
| --- | --- | --- | --- |
| 1 | Relatório sintético do Veri | | |
| 2 | Razão Social | Nome Fantasia | CNPJ |
| 3 | Cliente Sintético Alfa Ltda | Alfa | 11.222.333/0001-81 |
| 4 | Cliente Sintético Beta ME | Beta | 11.444.777/0001-61 |
| 5 | Cliente Sintético Sem Documento | | |
| 6 | Cliente Sintético Documento Curto | | 123.456 |

Resultado esperado da leitura: duas entradas válidas (linhas 3 e 4) e duas inválidas
(linha 5 sem CNPJ, linha 6 com 6 dígitos).

Não há amostra real anonimizada do Veri (#1735): a compatibilidade com um arquivo
exportado pelo Veri permanece não validada.
