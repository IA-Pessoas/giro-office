-- Relatorio de usuarios que nao sao pessoas e das permissoes dos ativos (#1382). Somente leitura.
--
--   psql "$DATABASE_URL" -X -f infra/prisma/repairs/report-non-person-users.sql
--
-- Decisao do dono (24/09/2026): so relatorio; o negocio decide e inativa ou ajusta pela tela. Os
-- selects de responsavel so listam usuarios active, entao inativar a entidade basta para tira-la.
-- Candidato = nome citado na issue, ou CPF vazio com nome de empresa ou de uma palavra so. E
-- heuristica: pessoa sem CPF cadastrado tambem aparece; confira a lista.
\set ON_ERROR_STOP on

-- Nao usa READ ONLY porque cria tabelas temporarias; so grava em pg_temp e termina em ROLLBACK.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL search_path = pg_catalog, public;

CREATE TEMP TABLE non_person_candidates AS
SELECT u.id, u.name, u.login, u.status, u.organization_id, r.reason
FROM users u
CROSS JOIN LATERAL (
  SELECT translate(lower(btrim(u.name)), 'áàâãäçéêèíóôõöúü', 'aaaaaceeeiooooouu') AS plain
) n
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN n.plain IN ('estoque', 'china direta', 'cliente', 'geceti', 'ats informatica fsa',
      'fav - advogados', 'alterdata informatica') THEN 'citado na issue'
    WHEN coalesce(btrim(u.cpf), '') <> '' THEN NULL
    WHEN n.plain ~ '\m(ltda|eireli|s/?a|me|informatica|advogados|contabil|contabilidade|estoque|cliente|servicos?|sistemas?|tecnologia|direta)\M'
      THEN 'nome de empresa sem CPF'
    WHEN n.plain !~ '\s' THEN 'nome de uma palavra sem CPF'
  END AS reason
) r
WHERE r.reason IS NOT NULL;

-- Vinculos de cada candidato em toda FK para users.id: inativar mantem esses registros, mas
-- o negocio precisa saber o que o usuario ainda responde.
CREATE TEMP TABLE non_person_links (user_id text, source text, rows bigint);
DO $links$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format(
      'INSERT INTO non_person_links SELECT t.%1$I::text, %2$L, count(*) FROM %3$s t
       JOIN non_person_candidates n ON n.id = t.%1$I::text GROUP BY 1',
      fk.col, fk.tbl::text || '.' || fk.col, fk.tbl);
  END LOOP;
END
$links$;

\echo '== Candidatos a entidade (organizacao | id | nome | login | status | motivo | vinculos)'
SELECT coalesce(n.organization_id, '(sem organizacao)'), n.id, n.name, n.login, n.status, n.reason,
       coalesce(string_agg(l.source || '=' || l.rows, ', ' ORDER BY l.source), '-')
FROM non_person_candidates n
LEFT JOIN non_person_links l ON l.user_id = n.id
GROUP BY n.id, n.name, n.login, n.status, n.reason, n.organization_id
ORDER BY n.organization_id, n.status, n.name;

-- permission (inteiro legado) tem rotulos divergentes nas telas; type (admin/owner/user) e o papel.
\echo '== Ativos que nao sao candidatos, para revisar permissoes (organizacao | nome | login | departamento | cargo | papel | permissao | modulos)'
SELECT coalesce(u.organization_id, '(sem organizacao)'), u.name, u.login, d.name,
       coalesce(u.job_title, '-'), coalesce(u.type::text, '-'), u.permission,
       coalesce((
         SELECT string_agg(kv.key || '=' || kv.value, ', ' ORDER BY kv.key)
         FROM jsonb_each(to_jsonb(p) - 'id' - 'user_id' - 'organization_id') kv
         WHERE kv.value::text ~ '^[1-9]'
       ), '-')
FROM users u
JOIN departments d ON d.id = u.department_id
LEFT JOIN permissions p ON p.id = u.permission_id
WHERE u.status = 'active' AND u.id NOT IN (SELECT id FROM non_person_candidates)
ORDER BY u.organization_id, d.name, u.name;

ROLLBACK;
