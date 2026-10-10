-- Um cliente pode estar em vários grupos, mas o mesmo par cliente+grupo não se repete (#1742).
-- Linhas repetidas só duplicam o mesmo vínculo (não há outro dado na tabela): fica a de menor id.
DELETE FROM "clients.clientsGroup" AS duplicate
USING "clients.clientsGroup" AS kept
WHERE duplicate."group_id" = kept."group_id"
  AND duplicate."client_id" = kept."client_id"
  AND duplicate."id" > kept."id";

CREATE UNIQUE INDEX "uq_clients_group_member"
  ON "clients.clientsGroup" ("group_id", "client_id");
