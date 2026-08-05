DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT organization_id, certificate_id, type
      FROM "notification.certificate"
      GROUP BY organization_id, certificate_id, type
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_cert_not_org_cert_type: duplicate certificate notifications exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT organization_id, name, cnpj, model
      FROM "certificate.pj"
      GROUP BY organization_id, name, cnpj, model
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_cert_pj_org_name_cnpj_model: duplicate PJ certificates exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT organization_id, name, cpf, model
      FROM "certificate.pf"
      GROUP BY organization_id, name, cpf, model
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Cannot create uq_cert_pf_org_name_cpf_model: duplicate PF certificates exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "uq_cert_not_org_cert_type" ON "notification.certificate"("organization_id", "certificate_id", "type");
CREATE INDEX "idx_cert_not_org_date_name" ON "notification.certificate"("organization_id", "date", "client_name");

CREATE UNIQUE INDEX "uq_cert_pj_org_name_cnpj_model" ON "certificate.pj"("organization_id", "name", "cnpj", "model");
CREATE INDEX "idx_cert_pj_org_exp_name" ON "certificate.pj"("organization_id", "expiration_date", "name");
CREATE INDEX "idx_cert_pj_org_has_exp_name" ON "certificate.pj"("organization_id", "has_certificate", "expiration_date", "name");

CREATE UNIQUE INDEX "uq_cert_pf_org_name_cpf_model" ON "certificate.pf"("organization_id", "name", "cpf", "model");
CREATE INDEX "idx_cert_pf_org_exp_name" ON "certificate.pf"("organization_id", "expiration_date", "name");
CREATE INDEX "idx_cert_pf_org_has_exp_name" ON "certificate.pf"("organization_id", "has_certificate", "expiration_date", "name");
