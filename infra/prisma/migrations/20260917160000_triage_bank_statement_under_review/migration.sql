ALTER TABLE "triagem.bank_statements"
  DROP CONSTRAINT "chk_triagem_bank_statements_status",
  ADD CONSTRAINT "chk_triagem_bank_statements_status"
    CHECK ("status" IN ('PENDING', 'COMPLETED', 'ATTENTION', 'UNDER_REVIEW', 'NOT_PRESENT', 'NOT_APPLICABLE'));
