-- Verificacao de dados de teste conhecidos em producao (#1383). Somente leitura.
-- Politica: docs/adr/0002-testes-em-producao.md.
--
--   psql "$DATABASE_URL" -X -f scripts/qa/verify-no-test-data.sql
--
-- Varre toda coluna de texto chamada name, title, label, code, agreement_number, asset_code,
-- equipament_list ou imei e conta valores com prefixo QA_ / "QA E2E" ou iguais (sem caixa e
-- espacos) aos nomes de teste antigos. O total deve ser 0; a lista por tabela aponta o resto.
\set ON_ERROR_STOP on

-- Nao usa READ ONLY porque cria tabela temporaria; so grava em pg_temp e termina em ROLLBACK.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path = pg_catalog, public;

CREATE TEMP TABLE test_data_found (source text, rows bigint);

DO $scan$
DECLARE
  target record;
  found bigint;
BEGIN
  FOR target IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('name', 'title', 'label', 'code', 'agreement_number', 'asset_code',
                          'equipament_list', 'imei')
      AND data_type IN ('text', 'character varying')
    ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %2$I LIKE %3$L OR %2$I LIKE %4$L
         OR lower(btrim(%2$I)) IN (%5$L, %6$L, %7$L)',
      target.table_name, target.column_name, 'QA\_%', 'QA E2E%', 'teste', 'teste 00001',
      'testecodigo')
    INTO found;
    IF found > 0 THEN
      INSERT INTO test_data_found VALUES (target.table_name || '.' || target.column_name, found);
    END IF;
  END LOOP;
END
$scan$;

\echo '== Dados de teste por tabela (tabela.coluna | registros)'
SELECT source, rows FROM test_data_found ORDER BY source;

\echo '== Total (deve ser 0)'
SELECT coalesce(sum(rows), 0) FROM test_data_found;

ROLLBACK;
