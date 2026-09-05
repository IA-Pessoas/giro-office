import { createHash } from "node:crypto";

export async function computeDatabaseIdentity(client) {
  const result = await client.query(
    [
      "SELECT table_name, column_name, data_type, is_nullable, udt_name",
      "FROM information_schema.columns",
      "WHERE table_schema = $1",
      "ORDER BY table_name, ordinal_position",
    ].join(" "),
    ["public"],
  );
  const digest = createHash("sha256").update(JSON.stringify(result.rows), "utf8").digest("hex");
  return `sha256:${digest}`;
}
