-- Licitação e plano de contas passam a aceitar "não selecionado" (NULL).
-- Nenhum valor existente é convertido: booleanos e texto livre ficam como estão.
ALTER TABLE "contabil.relationship"
  ALTER COLUMN "bidding" DROP NOT NULL,
  ALTER COLUMN "chart_accounts" DROP NOT NULL;
