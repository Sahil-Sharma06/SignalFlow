import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { seed } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __signalflowDb?: DB };

function create(): DB {
  const file = path.resolve(process.env.DATABASE_PATH ?? "./data/signalflow.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve("./drizzle") });
  // First run: seed automatically so `npm run dev` works right after `npm install`.
  if (!process.env.SIGNALFLOW_NO_AUTOSEED && !db.select({ id: schema.workspaceSettings.id }).from(schema.workspaceSettings).get()) {
    seed(db, { log: true });
  }
  return db;
}

export const db: DB = globalForDb.__signalflowDb ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.__signalflowDb = db;
