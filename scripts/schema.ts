// Prints the SQL Better Auth needs on top of the existing migrations, for the
// current config. Usage: npm run -s schema > migrations/NNNN_name.sql
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../src/auth";
import type { Env } from "../src/env";

const db = new DatabaseSync(":memory:");
for (const file of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) {
  db.exec(readFileSync(`migrations/${file}`, "utf8"));
}

const auth = createAuth({
  DB: db as unknown as D1Database,
  BASE_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "schema-generation-only-not-a-secret-value",
} satisfies Env);
const { compileMigrations } = await getMigrations(auth.options);
console.log(await compileMigrations());
