# Importação do histórico fiscal legado (simulação)

Épico #1621, issue #1630. Prepara a carga dos controles fiscais do PHP (banco `cbse`) para
`fiscal.monthly_controls` e `fiscal.annual_controls` **sem gravar nada**. A carga real é a
#1631 e só acontece quando houver export real e organização de destino conferidos.

## Como rodar

```bash
DATABASE_URL=<postgres> pnpm --dir services/fiscal-service exec tsx src/history/simulateCli.ts \
  --file export.json --organization <uuid-da-organização> [--out relatorio.json]
```

- A conexão abre uma transação `READ ONLY` e a desfaz no fim. O Postgres recusa qualquer
  escrita (código `25006`), mesmo que o código mude.
- `--organization` precisa ser igual ao `organization_id` do arquivo; caso contrário, a
  simulação não roda.
- Saída: resumo por resultado (aceitas, ignoradas, ambíguas), o motivo de cada linha não
  aceita e, com `--out`, o relatório completo em JSON.
- O relatório é determinístico: o mesmo arquivo sobre o mesmo banco gera o mesmo resultado.

## Contrato do arquivo (`giro-fiscal-history/v1`)

```json
{
  "format": "giro-fiscal-history/v1",
  "organization_id": "<uuid da organização de destino>",
  "client_map": [{ "legacy_code": 102, "client_id": "<uuid do cliente Office>" }],
  "monthly": [
    {
      "legacy_id": 1,
      "codigo_empresa": 101,
      "competencia": "2025-08",
      "tipo": "Completo",
      "responsavel": "7",
      "obligations": { "das": "2025-09-18", "efd_reinf": "0001-01-01", "dirbi": "" }
    }
  ],
  "annual": [
    {
      "legacy_id": 10,
      "codigo_empresa": 101,
      "competencia": "2024",
      "tipo": "SN",
      "responsavel": "7",
      "defis": "2025-03-28",
      "dmed": "0001-01-01",
      "dimob": "",
      "dirb": "2025-02-27"
    }
  ]
}
```

- `monthly`: uma linha de `tb_fiscal.controle_impostos` (cabeçalho) com as colunas de data
  do detalhe do regime (`controle_impostos_sn`, `_normal` ou `_mei`, ligadas por `id_comp`)
  em `obligations`, com os nomes e valores brutos das colunas.
- `annual`: uma linha de `tb_fiscal.controle_impostos_anual`.
- `tipo` é o valor do PHP: no mensal, `Completo` ou `Sublimite` para o Simples (`tb_fiscal.clientes_sn`), `Normal` ou `MEI`; no anual, `SN`, `Normal` ou `MEI`.
- O arquivo é validado ao entrar. Formato ou organização inválidos impedem a simulação; uma linha malformada sai como **ignorada**, com o campo e o motivo, e as demais seguem.
- `responsavel` vai como veio (id de usuário legado) e não é mapeado: o responsável no
  Office segue a regra do controle (padrão vigente ao nascer).

## Cliente

1. Entrada em `client_map` para o `codigo_empresa`: usada se o cliente for da organização de
   destino; senão, a linha é **ignorada**. O mesmo código apontando para clientes diferentes
   deixa a linha **ambígua**.
2. Sem entrada no mapa: aceita o cliente cujo `dominio_code` é o mesmo código, **só se houver
   exatamente um**. Dois ou mais deixam a linha **ambígua** (o sistema não escolhe); nenhum a
   deixa **ignorada**.
3. Duas linhas aceitas para o mesmo cliente e período ficam ambíguas.
4. Linha cujo controle já existe no Office sai com `existing_control: true`. A carga real
   completa esse controle em vez de duplicar.

## Datas e obrigações

| Valor legado | Mensal | Anual |
| --- | --- | --- |
| `0001-01-01` (campo desabilitado no PHP) | não aplicável, valor bruto preservado | não aplicável, valor bruto preservado |
| vazio ou `0000-00-00` | pendente | pendente |
| data válida | cumprida na data | **só dado bruto** (`RAW_ONLY`) |

- **Anual não confirma cumprimento.** `Fiscal::atualizarControleAnual` envia 7 valores para
  6 placeholders e grava `dirbi` numa tabela cuja coluna é `dirb`. As datas anuais do legado
  não comprovam entrega, então não viram "cumprida".
- **DIRB anual** é só dado bruto. A DIRBI vigente é mensal e condicional, e fica no controle
  mensal.
- **Correspondência com o catálogo:**
  - Simples (`Completo`/`Sublimite`): `das` → PGDAS-D.
  - Normal: `sped_contribuicoes` → EFD-Contribuições; `dctf` → DCTFWeb só de 2025-01 em
    diante (antes era a DCTF PGD).
  - Todos os regimes: `dirbi` → DIRBI.
  - Anual: `defis`, `dmed` e `dimob` vão para as declarações de mesmo nome.
  - Demais colunas (ISS, antecipações, ICMS, PIS/COFINS...) ficam com `code: null`, como dado
    bruto para conferência.
