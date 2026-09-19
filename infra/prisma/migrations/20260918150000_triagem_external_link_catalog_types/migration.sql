ALTER TABLE "triagem.external_links"
  DROP CONSTRAINT "triagem.external_links_type_check";

ALTER TABLE "triagem.external_links"
  ADD CONSTRAINT "triagem.external_links_type_check"
  CHECK (length(btrim("type")) > 0 AND length("type") <= 100);
