import { Pool } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL || process.env.STORAGE_URL;
const usePostgres = !!databaseUrl && !databaseUrl.startsWith("file:");

// Exposé pour les requêtes qui diffèrent trop entre dialectes (ex: ANY vs IN).
export const isPostgres = usePostgres;

const g = globalThis as unknown as {
  sqliteDb: unknown;
  pgPool: Pool | undefined;
  pgInitDone: boolean;
};

// --- SQLite (local dev only — dynamic require so Vercel never bundles it) ---
function getLocalDb() {
  if (!g.sqliteDb) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const path = require("path");
    const dbPath = path.join(process.cwd(), "dev.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS "Lead" (
        id TEXT PRIMARY KEY NOT NULL,
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        subject TEXT NOT NULL,
        city TEXT,
        status TEXT NOT NULL DEFAULT 'nouveau',
        "lastContactDate" TEXT,
        notes TEXT,
        source TEXT,
        "contactLink" TEXT,
        contacted INTEGER NOT NULL DEFAULT 0,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    try { db.exec('ALTER TABLE "Lead" ADD COLUMN "contactLink" TEXT'); } catch {}
    try { db.exec('ALTER TABLE "Lead" ADD COLUMN contacted INTEGER NOT NULL DEFAULT 0'); } catch {}
    db.exec(`
      CREATE TABLE IF NOT EXISTS "PartnerSchool" (
        id TEXT PRIMARY KEY NOT NULL,
        etablissement TEXT NOT NULL,
        ville TEXT,
        "typeContact" TEXT NOT NULL DEFAULT 'Association parents',
        "nomContact" TEXT,
        fonction TEXT,
        email TEXT,
        telephone TEXT,
        lien TEXT,
        statut TEXT NOT NULL DEFAULT 'à contacter',
        notes TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    g.sqliteDb = db;
  }
  return g.sqliteDb as {
    prepare: (sql: string) => {
      all: (...params: unknown[]) => unknown[];
      get: (...params: unknown[]) => unknown;
      run: (...params: unknown[]) => unknown;
    };
  };
}

// --- PostgreSQL (production on Vercel/Neon) ---
async function getPgPool() {
  if (!g.pgPool) {
    g.pgPool = new Pool({ connectionString: databaseUrl });
  }
  if (!g.pgInitDone) {
    await g.pgPool.query(`
      CREATE TABLE IF NOT EXISTS "Lead" (
        id TEXT PRIMARY KEY NOT NULL,
        "firstName" TEXT NOT NULL,
        "lastName" TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        subject TEXT NOT NULL,
        city TEXT,
        status TEXT NOT NULL DEFAULT 'nouveau',
        "lastContactDate" TEXT,
        notes TEXT,
        source TEXT,
        "contactLink" TEXT,
        contacted BOOLEAN NOT NULL DEFAULT FALSE,
        "createdAt" TEXT NOT NULL DEFAULT NOW()::TEXT,
        "updatedAt" TEXT NOT NULL DEFAULT NOW()::TEXT
      )
    `);
    try { await g.pgPool.query('ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "contactLink" TEXT'); } catch {}
    try { await g.pgPool.query('ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS contacted BOOLEAN NOT NULL DEFAULT FALSE'); } catch {}
    await g.pgPool.query(`
      CREATE TABLE IF NOT EXISTS "PartnerSchool" (
        id TEXT PRIMARY KEY NOT NULL,
        etablissement TEXT NOT NULL,
        ville TEXT,
        "typeContact" TEXT NOT NULL DEFAULT 'Association parents',
        "nomContact" TEXT,
        fonction TEXT,
        email TEXT,
        telephone TEXT,
        lien TEXT,
        statut TEXT NOT NULL DEFAULT 'à contacter',
        notes TEXT,
        "createdAt" TEXT NOT NULL DEFAULT NOW()::TEXT,
        "updatedAt" TEXT NOT NULL DEFAULT NOW()::TEXT
      )
    `);
    g.pgInitDone = true;
  }
  return g.pgPool;
}

// --- Unified async interface ---

export async function dbAll(
  sqliteSql: string,
  pgSql: string,
  params: unknown[] = []
): Promise<Record<string, unknown>[]> {
  if (usePostgres) {
    const pool = await getPgPool();
    const result = await pool.query(pgSql, params);
    return result.rows;
  }
  return getLocalDb().prepare(sqliteSql).all(...params) as Record<
    string,
    unknown
  >[];
}

export async function dbGet(
  sqliteSql: string,
  pgSql: string,
  params: unknown[] = []
): Promise<Record<string, unknown> | undefined> {
  if (usePostgres) {
    const pool = await getPgPool();
    const result = await pool.query(pgSql, params);
    return result.rows[0];
  }
  return getLocalDb().prepare(sqliteSql).get(...params) as
    | Record<string, unknown>
    | undefined;
}

export async function dbRun(
  sqliteSql: string,
  pgSql: string,
  params: unknown[] = []
) {
  if (usePostgres) {
    const pool = await getPgPool();
    await pool.query(pgSql, params);
    return;
  }
  getLocalDb().prepare(sqliteSql).run(...params);
}
