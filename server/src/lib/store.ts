import fs from "node:fs/promises";
import path from "node:path";
import { DB } from "../types.js";

const dataDir = path.resolve(process.cwd(), "server-data");
const dbFile = path.join(dataDir, "db.json");

const defaultDb: DB = { projects: [], conversations: [], messages: [] };

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbFile);
  } catch {
    await fs.writeFile(dbFile, JSON.stringify(defaultDb, null, 2), "utf8");
  }
}

export async function readDb(): Promise<DB> {
  await ensureDb();
  const raw = await fs.readFile(dbFile, "utf8");
  return JSON.parse(raw) as DB;
}

export async function writeDb(db: DB) {
  await ensureDb();
  await fs.writeFile(dbFile, JSON.stringify(db, null, 2), "utf8");
}

export async function mutateDb(mutator: (db: DB) => void | Promise<void>) {
  const db = await readDb();
  await mutator(db);
  await writeDb(db);
  return db;
}
