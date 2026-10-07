import { DatabaseSync } from "node:sqlite";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { resolveDbPath } from "./path.ts";

export type Db = NodeSQLiteDatabase;

let db: Db | undefined;
let client: DatabaseSync | undefined;

export function getDb(): Db {
    if(db === undefined) {
        client = new DatabaseSync(resolveDbPath());
        client.exec("PRAGMA journal_mode = WAL;");
        db = drizzle({client});
    }
    return db;
}

export function closeDb(): void {
    client?.close();
    client = undefined;
    db = undefined;
}