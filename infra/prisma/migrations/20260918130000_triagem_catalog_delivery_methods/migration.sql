ALTER TABLE "triagem.catalog_items"
  DROP CONSTRAINT "triagem.catalog_items_kind_check";

ALTER TABLE "triagem.catalog_items"
  ADD CONSTRAINT "triagem.catalog_items_kind_check"
  CHECK ("kind" IN ('JUSTIFICATION', 'LINK_TYPE', 'DELIVERY_METHOD', 'STATE_SITE'));

ALTER TABLE "triagem.competence_catalog_snapshots"
  DROP CONSTRAINT "triagem.competence_catalog_snapshots_kind_check";

ALTER TABLE "triagem.competence_catalog_snapshots"
  ADD CONSTRAINT "triagem.competence_catalog_snapshots_kind_check"
  CHECK ("kind" IN ('JUSTIFICATION', 'LINK_TYPE', 'DELIVERY_METHOD', 'STATE_SITE'));
