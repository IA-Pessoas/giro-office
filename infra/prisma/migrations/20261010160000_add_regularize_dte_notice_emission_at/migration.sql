-- Data de emissão do aviso DTE lida do texto dd/mm/aaaa hh:mm (#1745). A caixa de avisos
-- filtra o período por ela, como o dte/home.php do legado. NULL = texto fora do formato ou
-- aviso importado antes desta coluna; nesses casos a caixa usa a data da importação.
ALTER TABLE "regularize.dte_notices" ADD COLUMN "data_emissao_at" TIMESTAMP(3);

CREATE INDEX "idx_regularize_dte_notice_org_emissao"
  ON "regularize.dte_notices" ("organization_id", "data_emissao_at");
