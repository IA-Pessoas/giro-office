DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "pessoal.payroll" AS payroll
    LEFT JOIN "pessoal.group" AS pessoal_group
      ON pessoal_group."id" = payroll."group_id"
      AND pessoal_group."organization_id" = payroll."organization_id"
    WHERE payroll."group_id" IS NULL OR pessoal_group."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Nao e possivel remover pessoal.payroll.group: existem folhas sem group_id canonico ou fora da organizacao.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "pessoal.group"
    WHERE "system_key" = 'NO_MOVEMENT' AND "policy" <> 'NO_OBLIGATIONS'
  ) THEN
    RAISE EXCEPTION 'Nao e possivel finalizar grupos de Pessoal: Sem Movimento deve usar NO_OBLIGATIONS.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "pessoal.obrigations" AS obligation
    LEFT JOIN "pessoal.group" AS pessoal_group
      ON pessoal_group."id" = obligation."group_snapshot_id"
      AND pessoal_group."organization_id" = obligation."organization_id"
    WHERE obligation."group_snapshot_id" IS NOT NULL AND pessoal_group."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Nao e possivel finalizar grupos de Pessoal: existe snapshot de obrigacao sem grupo historico.';
  END IF;
END
$$;

ALTER TABLE "pessoal.payroll"
  ALTER COLUMN "group_id" SET NOT NULL,
  DROP COLUMN "group";
