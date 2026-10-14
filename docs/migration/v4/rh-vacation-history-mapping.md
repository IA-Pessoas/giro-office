# Mapeamento do histórico de férias do RH

O histórico fica vazio até existir um export estruturado. Não há endpoint de cadastro/importação nesta entrega e nenhum upload pessoal é usado como fonte.

## Origem legada

| Tabela legada | Campo | Destino |
| --- | --- | --- |
| `tb_rh.ferias_periodos` | `id` | `rh.vacation_periods.legacy_period_id` |
| `tb_rh.ferias_periodos` | `col_id` | `rh.vacation_periods.employee_id`, após resolver o colaborador dentro da mesma organização |
| `tb_rh.ferias_periodos` | `periodo_inicio` / `periodo_fim` | `period_start` / `period_end` |
| `tb_rh.ferias_periodos` | `aquisitivo_inicio` / `aquisitivo_fim` | `acquisition_start` / `acquisition_end` |
| `tb_rh.ferias_datas` | `id` | `rh.vacation_usages.legacy_usage_id` |
| `tb_rh.ferias_datas` | `periodo_id` | `period_id`, resolvido pelo período legado na mesma organização |
| `tb_rh.ferias_datas` | `data_inicio` / `data_fim` | `start_date` / `end_date` |
| `tb_rh.ferias_datas` | `obs` | `observation` |
| `tb_rh.ferias_datas` | `anexo` | Não importar nem expor |

## Deduplicação e isolamento

- Períodos: chave de origem `(organization_id, tb_rh.ferias_periodos, id)`; no modelo, `(organization_id, legacy_period_id)`.
- Usos: chave de origem `(organization_id, tb_rh.ferias_datas, id)`; no modelo, `(organization_id, legacy_usage_id)`.
- Converter o ID legado para texto preservando seu valor. A tabela de origem faz parte da chave conceitual, pois os IDs de período e uso pertencem a tabelas diferentes.
- Resolver `col_id` e `periodo_id` por organização. Rejeitar referências ausentes ou ambíguas em uma futura importação.
- Persistir períodos, usos e vínculos na mesma transação de importação. A chave composta do uso também impede associar um período de outra organização.
- Não inferir registros pelo schema legado, por SQL local ou por anexos enviados por pessoas. A carga só poderá começar após a disponibilização do export estruturado.
