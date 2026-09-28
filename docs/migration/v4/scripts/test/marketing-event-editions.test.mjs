import assert from "node:assert/strict";
import test from "node:test";
import {
  getFieldByDatabaseName,
  getModelByDatabaseName,
  loadPrismaCatalog,
} from "../lib/prisma-catalog.mjs";

const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

test("event editions are relationally scoped to their event and organization", () => {
  const edition = getModelByDatabaseName(catalog, "mtk.event_editions");
  assert.ok(edition, "mtk.event_editions model must exist");
  assert.ok(getFieldByDatabaseName(edition, "organization_id"));
  assert.ok(getFieldByDatabaseName(edition, "event_id"));
  assert.ok(getFieldByDatabaseName(edition, "legacy_id"));
  assert.ok(getFieldByDatabaseName(edition, "name"));
  assert.ok(getFieldByDatabaseName(edition, "date"));
  assert.ok(getFieldByDatabaseName(edition, "place"));
  assert.ok(edition.compoundUnique.some((fields) => fields.join(",") === "id,organization_id"));
});

test("budget rows use a scoped edition relation and exact decimal amounts", () => {
  const budget = getModelByDatabaseName(catalog, "mtk.event_edition_budget_items");
  assert.ok(budget, "mtk.event_edition_budget_items model must exist");
  assert.ok(getFieldByDatabaseName(budget, "organization_id"));
  assert.ok(getFieldByDatabaseName(budget, "edition_id"));
  assert.ok(getFieldByDatabaseName(budget, "legacy_id"));
  assert.equal(getFieldByDatabaseName(budget, "amount")?.prismaType, "Decimal");
  assert.ok(budget.fields.some((field) => field.relationModel === "MarketingEventEdition"));
  assert.ok(budget.compoundUnique.some((fields) => fields.join(",") === "id,organization_id"));
});
