-- #1692: prioridade Sim/Não e meio de envio do cliente na configuração fiscal da triagem
-- (legado: tb_triagem.prioridade e tb_triagem.campos.envio).
ALTER TABLE "triagem.configs"
  ADD COLUMN "priority" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "delivery_method" VARCHAR(100);
