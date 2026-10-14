import { readFile, writeFile } from "node:fs/promises";

const [name, id] = process.argv.slice(2);
if (
  !name ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id ?? "",
  )
) {
  throw new Error(
    "Usage: node scripts/configure-d1.mjs database-name database-uuid",
  );
}
const path = new URL("../wrangler.jsonc", import.meta.url);
const config = JSON.parse(await readFile(path, "utf8"));
config.d1_databases = [
  ...(config.d1_databases ?? []).filter(
    (database) => database.binding !== "DB",
  ),
  {
    binding: "DB",
    database_name: name,
    database_id: id,
    migrations_dir: "migrations",
  },
];
await writeFile(path, JSON.stringify(config, null, 2) + "\n");
