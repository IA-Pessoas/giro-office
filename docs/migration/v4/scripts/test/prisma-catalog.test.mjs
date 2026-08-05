import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertRuleMatchesPrisma,
  getFieldByDatabaseName,
  getModelByDatabaseName,
  loadPrismaCatalog,
} from "../lib/prisma-catalog.mjs";

const fixturePath = new URL("./fixtures/schema-catalog.prisma", import.meta.url);
const repositorySchemaPath = new URL("../../../../../infra/prisma/schema.prisma", import.meta.url);

test("loadPrismaCatalog expõe responsável de solicitação RH como anulável", async () => {
  const catalog = await loadPrismaCatalog(repositorySchemaPath);
  const rhRequests = getModelByDatabaseName(catalog, "rh.requests");
  const assignee = getFieldByDatabaseName(rhRequests, "assigned_to_user_id");

  assert.equal(assignee?.nullable, true);
});

test("loadPrismaCatalog preserva contratos e nomes físicos de modelos, campos e índices", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.deepEqual(catalog, {
    models: [
      {
        prismaName: "Member",
        databaseName: "members_table",
        fields: [
          {
            model: "Member",
            prismaName: "id",
            databaseName: "id",
            prismaType: "String",
            nullable: false,
            list: false,
            id: true,
            unique: false,
            relationModel: null,
            relationFields: [],
            relationReferences: [],
          },
          {
            model: "Member",
            prismaName: "workspaceId",
            databaseName: "workspace_id",
            prismaType: "String",
            nullable: false,
            list: false,
            id: false,
            unique: false,
            relationModel: null,
            relationFields: [],
            relationReferences: [],
          },
          {
            model: "Member",
            prismaName: "workspace",
            databaseName: "workspace",
            prismaType: "Workspace",
            nullable: false,
            list: false,
            id: false,
            unique: false,
            relationModel: "Workspace",
            relationFields: ["workspaceId"],
            relationReferences: ["id"],
          },
        ],
        compoundUnique: [],
        indexes: [],
      },
      {
        prismaName: "Workspace",
        databaseName: "workspace_table",
        fields: [
          {
            model: "Workspace",
            prismaName: "id",
            databaseName: "workspace_id",
            prismaType: "String",
            nullable: false,
            list: false,
            id: true,
            unique: false,
            relationModel: null,
            relationFields: [],
            relationReferences: [],
          },
          {
            model: "Workspace",
            prismaName: "name",
            databaseName: "workspace_name",
            prismaType: "String",
            nullable: false,
            list: false,
            id: false,
            unique: true,
            relationModel: null,
            relationFields: [],
            relationReferences: [],
          },
          {
            model: "Workspace",
            prismaName: "note",
            databaseName: "workspace_note",
            prismaType: "String",
            nullable: true,
            list: false,
            id: false,
            unique: false,
            relationModel: null,
            relationFields: [],
            relationReferences: [],
          },
          {
            model: "Workspace",
            prismaName: "labels",
            databaseName: "labels",
            prismaType: "String",
            nullable: false,
            list: true,
            id: false,
            unique: false,
            relationModel: null,
            relationFields: [],
            relationReferences: [],
          },
          {
            model: "Workspace",
            prismaName: "members",
            databaseName: "members",
            prismaType: "Member",
            nullable: false,
            list: true,
            id: false,
            unique: false,
            relationModel: "Member",
            relationFields: [],
            relationReferences: [],
          },
        ],
        compoundUnique: [["workspace_name", "workspace_note"]],
        indexes: [["workspace_name", "workspace_note"]],
      },
    ],
  });
});

test("helpers localizam somente destinos físicos existentes", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);
  const workspace = getModelByDatabaseName(catalog, "workspace_table");

  assert.equal(workspace?.prismaName, "Workspace");
  assert.equal(getModelByDatabaseName(catalog, "missing_table"), null);
  assert.equal(getFieldByDatabaseName(workspace, "workspace_name")?.prismaName, "name");
  assert.equal(getFieldByDatabaseName(workspace, "missing_column"), null);

  assert.throws(
    () => assertRuleMatchesPrisma({ destinationTable: "missing_table", columns: [] }, catalog),
    /tabela de destino inexistente/i,
  );
  assert.throws(
    () =>
      assertRuleMatchesPrisma(
        {
          destinationTable: "workspace_table",
          columns: [{ destinationColumn: "missing_column", nullHandling: "reject" }],
        },
        catalog,
      ),
    /coluna de destino inexistente/i,
  );
});

test("assertRuleMatchesPrisma exige política de nulo e relações com colunas declaradas", async () => {
  const catalog = await loadPrismaCatalog(fixturePath);

  assert.throws(
    () =>
      assertRuleMatchesPrisma(
        {
          destinationTable: "workspace_table",
          columns: [{ destinationColumn: "workspace_name" }],
        },
        catalog,
      ),
    /política de nulo/i,
  );

  assert.doesNotThrow(() =>
    assertRuleMatchesPrisma(
      {
        destinationTable: "workspace_table",
        columns: [{ destinationColumn: "workspace_name", nullHandling: "reject" }],
      },
      catalog,
    ),
  );

  const catalogWithBrokenRelation = JSON.parse(JSON.stringify(catalog));
  const member = getModelByDatabaseName(catalogWithBrokenRelation, "members_table");
  member.fields[2].relationFields = ["missingWorkspaceId"];

  assert.throws(
    () =>
      assertRuleMatchesPrisma(
        {
          destinationTable: "members_table",
          columns: [{ destinationColumn: "id", nullHandling: "generated" }],
        },
        catalogWithBrokenRelation,
      ),
    /relação.*missingWorkspaceId/i,
  );
});

test("loadPrismaCatalog rejeita @relation sem fechamento citando model e campo", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "prisma-catalog-"));
  const schemaPath = path.join(directory, "broken-relation.prisma");
  await writeFile(
    schemaPath,
    [
      "model Parent {",
      "  id String @id",
      "}",
      "",
      "model Child {",
      "  id       String @id",
      "  parentId String",
      "  parent   Parent @relation(fields: [parentId], references: [id]",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    () => loadPrismaCatalog(schemaPath),
    (error) => {
      assert.match(error.message, /model Child.*parent/i);
      assert.equal(error.message.includes("parentId String"), false);
      return true;
    },
  );
});

test("loadPrismaCatalog rejeita bloco model malformado sem expor o schema", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "prisma-catalog-"));
  const schemaPath = path.join(directory, "broken.prisma");
  await writeFile(schemaPath, "model Broken {\n  id String\n", "utf8");
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    () => loadPrismaCatalog(schemaPath),
    (error) => {
      assert.match(error.message, /model Broken/i);
      assert.equal(error.message.includes("id String"), false);
      return true;
    },
  );
});
