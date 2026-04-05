import { ipcMain, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DbDriver = 'sqlite' | 'postgresql' | 'mysql';

export type DbConnectionProfile = {
  id: string;
  name: string;
  driver: DbDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  /** For SQLite – path to the .db file (stored in `database`) */
};

export type DbColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
};

export type DbTableIndex = {
  name: string;
  unique: boolean;
  columns: string[];
};

export type DbTableForeignKey = {
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
};

export type DbTable = {
  name: string;
  schema: string;
  columns: DbColumn[];
  indexes: DbTableIndex[];
  foreignKeys: DbTableForeignKey[];
};

export type DbQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  affectedRows: number;
  duration: number;
};

// ---------------------------------------------------------------------------
// Persistence helpers (connection profiles stored as JSON)
// ---------------------------------------------------------------------------

function getProfilesPath(): string {
  return path.join(app.getPath('userData'), 'db-connections.json');
}

function readProfiles(): DbConnectionProfile[] {
  try {
    return JSON.parse(fs.readFileSync(getProfilesPath(), 'utf-8'));
  } catch {
    return [];
  }
}

function writeProfiles(profiles: DbConnectionProfile[]): void {
  fs.writeFileSync(getProfilesPath(), JSON.stringify(profiles, null, 2));
}

// ---------------------------------------------------------------------------
// Query history persistence
// ---------------------------------------------------------------------------

function getHistoryPath(): string {
  return path.join(app.getPath('userData'), 'db-query-history.json');
}

type HistoryEntry = { id: string; connectionId: string; query: string; timestamp: number };

function readHistory(): HistoryEntry[] {
  try {
    return JSON.parse(fs.readFileSync(getHistoryPath(), 'utf-8'));
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  fs.writeFileSync(getHistoryPath(), JSON.stringify(entries, null, 2));
}

// ---------------------------------------------------------------------------
// Active connection pool (kept alive for the app session)
// ---------------------------------------------------------------------------

type ActiveConnection = {
  driver: DbDriver;
  handle: unknown; // Database-specific handle
};

const connections = new Map<string, ActiveConnection>();

async function getConnection(profile: DbConnectionProfile): Promise<ActiveConnection> {
  const existing = connections.get(profile.id);
  if (existing) return existing;

  let handle: unknown;

  switch (profile.driver) {
    case 'sqlite': {
      const Database = (await import('better-sqlite3')).default;
      handle = new Database(profile.database, { readonly: false });
      break;
    }
    case 'postgresql': {
      const { Client } = await import('pg');
      const client = new Client({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        user: profile.username,
        password: profile.password,
        connectionTimeoutMillis: 10_000,
      });
      await client.connect();
      handle = client;
      break;
    }
    case 'mysql': {
      const mysql = await import('mysql2/promise');
      handle = await mysql.createConnection({
        host: profile.host,
        port: profile.port,
        database: profile.database,
        user: profile.username,
        password: profile.password,
        connectTimeout: 10_000,
      });
      break;
    }
  }

  const conn: ActiveConnection = { driver: profile.driver, handle };
  connections.set(profile.id, conn);
  return conn;
}

async function closeConnection(profileId: string): Promise<void> {
  const conn = connections.get(profileId);
  if (!conn) return;

  try {
    switch (conn.driver) {
      case 'sqlite': {
        (conn.handle as import('better-sqlite3').Database).close();
        break;
      }
      case 'postgresql': {
        await (conn.handle as import('pg').Client).end();
        break;
      }
      case 'mysql': {
        await (conn.handle as import('mysql2/promise').Connection).end();
        break;
      }
    }
  } catch { /* best-effort */ }

  connections.delete(profileId);
}

// ---------------------------------------------------------------------------
// Query execution
// ---------------------------------------------------------------------------

async function executeQuery(conn: ActiveConnection, sql: string): Promise<DbQueryResult> {
  const start = Date.now();

  switch (conn.driver) {
    case 'sqlite': {
      const db = conn.handle as import('better-sqlite3').Database;
      const trimmed = sql.trim();
      const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(trimmed);

      if (isSelect) {
        const stmt = db.prepare(trimmed);
        const rows = stmt.all() as Record<string, unknown>[];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : (stmt.columns?.() ?? []).map((c: { name: string }) => c.name);
        return {
          columns,
          rows,
          rowCount: rows.length,
          affectedRows: 0,
          duration: Date.now() - start,
        };
      } else {
        const result = db.exec(trimmed);
        // exec returns an array, but for non-SELECT it's usually empty
        // Use run() for single statements to get changes count
        try {
          const info = db.prepare(trimmed).run();
          return {
            columns: [],
            rows: [],
            rowCount: 0,
            affectedRows: info.changes,
            duration: Date.now() - start,
          };
        } catch {
          return {
            columns: [],
            rows: [],
            rowCount: 0,
            affectedRows: 0,
            duration: Date.now() - start,
          };
        }
      }
    }

    case 'postgresql': {
      const client = conn.handle as import('pg').Client;
      const result = await client.query(sql);
      const rows = result.rows ?? [];
      const columns = result.fields?.map((f) => f.name) ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
      return {
        columns,
        rows,
        rowCount: rows.length,
        affectedRows: result.rowCount ?? 0,
        duration: Date.now() - start,
      };
    }

    case 'mysql': {
      const connection = conn.handle as import('mysql2/promise').Connection;
      const [resultOrRows, fields] = await connection.query(sql);
      const isRows = Array.isArray(resultOrRows);
      if (isRows && fields && Array.isArray(fields)) {
        const rows = resultOrRows as Record<string, unknown>[];
        const columns = (fields as Array<{ name: string }>).map((f) => f.name);
        return {
          columns,
          rows,
          rowCount: rows.length,
          affectedRows: 0,
          duration: Date.now() - start,
        };
      }
      // Non-select result
      const info = resultOrRows as { affectedRows?: number };
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: info.affectedRows ?? 0,
        duration: Date.now() - start,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

async function getSchema(conn: ActiveConnection): Promise<DbTable[]> {
  switch (conn.driver) {
    case 'sqlite': {
      const db = conn.handle as import('better-sqlite3').Database;
      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      ).all() as { name: string }[];

      return tables.map((t) => {
        const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all() as {
          name: string; type: string; notnull: number; pk: number; dflt_value: string | null;
        }[];

        const idxList = db.prepare(`PRAGMA index_list("${t.name}")`).all() as {
          name: string; unique: number; origin: string;
        }[];
        const indexes: DbTableIndex[] = idxList
          .filter((idx) => idx.origin !== 'pk')
          .map((idx) => {
            const idxCols = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as { name: string }[];
            return { name: idx.name, unique: idx.unique === 1, columns: idxCols.map((c) => c.name) };
          });

        const fkList = db.prepare(`PRAGMA foreign_key_list("${t.name}")`).all() as {
          id: number; table: string; from: string; to: string;
        }[];
        const fkMap = new Map<number, { columns: string[]; table: string; toColumns: string[] }>();
        for (const fk of fkList) {
          const entry = fkMap.get(fk.id) ?? { columns: [], table: fk.table, toColumns: [] };
          entry.columns.push(fk.from);
          entry.toColumns.push(fk.to);
          fkMap.set(fk.id, entry);
        }
        const foreignKeys: DbTableForeignKey[] = Array.from(fkMap.values()).map((fk) => ({
          columns: fk.columns,
          referencedSchema: 'main',
          referencedTable: fk.table,
          referencedColumns: fk.toColumns,
        }));

        return {
          name: t.name,
          schema: 'main',
          columns: cols.map((c) => ({
            name: c.name, type: c.type, nullable: c.notnull === 0,
            primaryKey: c.pk > 0, defaultValue: c.dflt_value,
          })),
          indexes,
          foreignKeys,
        };
      });
    }

    case 'postgresql': {
      const client = conn.handle as import('pg').Client;
      const tableRes = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
      `);

      const tables: DbTable[] = [];
      for (const row of tableRes.rows) {
        const colRes = await client.query(`
          SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
            COALESCE(bool_or(tc.constraint_type = 'PRIMARY KEY'), false) AS is_pk
          FROM information_schema.columns c
          LEFT JOIN information_schema.key_column_usage kcu
            ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name AND c.column_name = kcu.column_name
          LEFT JOIN information_schema.table_constraints tc
            ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
          WHERE c.table_schema = $1 AND c.table_name = $2
          GROUP BY c.column_name, c.data_type, c.is_nullable, c.column_default, c.ordinal_position
          ORDER BY c.ordinal_position
        `, [row.table_schema, row.table_name]);

        const idxRes = await client.query(`
          SELECT i.relname AS index_name, ix.indisunique AS is_unique, a.attname AS column_name
          FROM pg_class t
          JOIN pg_index ix ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE t.relkind = 'r' AND NOT ix.indisprimary
            AND n.nspname = $1 AND t.relname = $2
          ORDER BY i.relname, a.attnum
        `, [row.table_schema, row.table_name]);

        const idxMap = new Map<string, DbTableIndex>();
        for (const r of idxRes.rows) {
          const entry = idxMap.get(r.index_name) ?? { name: r.index_name, unique: r.is_unique, columns: [] };
          entry.columns.push(r.column_name);
          idxMap.set(r.index_name, entry);
        }

        const fkRes = await client.query(`
          SELECT kcu.column_name, ccu.table_schema AS ref_schema,
            ccu.table_name AS ref_table, ccu.column_name AS ref_column,
            tc.constraint_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = $1 AND tc.table_name = $2
          ORDER BY tc.constraint_name, kcu.ordinal_position
        `, [row.table_schema, row.table_name]);

        const fkMap = new Map<string, DbTableForeignKey>();
        for (const r of fkRes.rows) {
          const entry = fkMap.get(r.constraint_name) ?? {
            columns: [], referencedSchema: r.ref_schema,
            referencedTable: r.ref_table, referencedColumns: [],
          };
          entry.columns.push(r.column_name);
          entry.referencedColumns.push(r.ref_column);
          fkMap.set(r.constraint_name, entry);
        }

        tables.push({
          name: row.table_name,
          schema: row.table_schema,
          columns: colRes.rows.map((c: Record<string, unknown>) => ({
            name: c.column_name as string, type: c.data_type as string,
            nullable: c.is_nullable === 'YES', primaryKey: c.is_pk === true,
            defaultValue: c.column_default as string | null,
          })),
          indexes: Array.from(idxMap.values()),
          foreignKeys: Array.from(fkMap.values()),
        });
      }
      return tables;
    }

    case 'mysql': {
      const connection = conn.handle as import('mysql2/promise').Connection;
      const [tables] = await connection.query(
        `SELECT TABLE_NAME, TABLE_SCHEMA FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      );

      const result: DbTable[] = [];
      for (const t of tables as Array<{ TABLE_NAME: string; TABLE_SCHEMA: string }>) {
        const [cols] = await connection.query(
          `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
           FROM information_schema.columns
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
          [t.TABLE_SCHEMA, t.TABLE_NAME],
        );

        const [idxRows] = await connection.query(
          `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
           FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME != 'PRIMARY'
           ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
          [t.TABLE_SCHEMA, t.TABLE_NAME],
        );
        const idxMap = new Map<string, DbTableIndex>();
        for (const r of idxRows as Array<{ INDEX_NAME: string; NON_UNIQUE: number; COLUMN_NAME: string }>) {
          const entry = idxMap.get(r.INDEX_NAME) ?? { name: r.INDEX_NAME, unique: r.NON_UNIQUE === 0, columns: [] };
          entry.columns.push(r.COLUMN_NAME);
          idxMap.set(r.INDEX_NAME, entry);
        }

        const [fkRows] = await connection.query(
          `SELECT COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
           FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
           ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
          [t.TABLE_SCHEMA, t.TABLE_NAME],
        );
        const fkMap = new Map<string, DbTableForeignKey>();
        for (const r of fkRows as Array<{ COLUMN_NAME: string; REFERENCED_TABLE_SCHEMA: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string; CONSTRAINT_NAME: string }>) {
          const entry = fkMap.get(r.CONSTRAINT_NAME) ?? {
            columns: [], referencedSchema: r.REFERENCED_TABLE_SCHEMA,
            referencedTable: r.REFERENCED_TABLE_NAME, referencedColumns: [],
          };
          entry.columns.push(r.COLUMN_NAME);
          entry.referencedColumns.push(r.REFERENCED_COLUMN_NAME);
          fkMap.set(r.CONSTRAINT_NAME, entry);
        }

        result.push({
          name: t.TABLE_NAME,
          schema: t.TABLE_SCHEMA,
          columns: (cols as Array<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string; COLUMN_DEFAULT: string | null; COLUMN_KEY: string }>).map((c) => ({
            name: c.COLUMN_NAME, type: c.DATA_TYPE,
            nullable: c.IS_NULLABLE === 'YES', primaryKey: c.COLUMN_KEY === 'PRI',
            defaultValue: c.COLUMN_DEFAULT,
          })),
          indexes: Array.from(idxMap.values()),
          foreignKeys: Array.from(fkMap.values()),
        });
      }
      return result;
    }
  }
}

// ---------------------------------------------------------------------------
// IPC Registration
// ---------------------------------------------------------------------------

export function registerDbIpc(): void {
  // --- Connection profiles ---

  ipcMain.handle('db:profiles:list', () => {
    return readProfiles();
  });

  ipcMain.handle('db:profiles:save', (_event, profile: DbConnectionProfile) => {
    const profiles = readProfiles();
    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx !== -1) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    writeProfiles(profiles);
    return profile;
  });

  ipcMain.handle('db:profiles:delete', async (_event, id: string) => {
    await closeConnection(id);
    writeProfiles(readProfiles().filter((p) => p.id !== id));
  });

  // --- Connect / Disconnect / Test ---

  ipcMain.handle('db:connect', async (_event, profile: DbConnectionProfile): Promise<{ success: true } | { error: string }> => {
    try {
      await getConnection(profile);
      return { success: true };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('db:disconnect', async (_event, profileId: string) => {
    await closeConnection(profileId);
  });

  ipcMain.handle('db:test', async (_event, profile: DbConnectionProfile): Promise<{ success: true; duration: number } | { error: string }> => {
    const start = Date.now();
    try {
      // Temporarily connect, run a trivial query, then close
      const conn = await getConnection(profile);
      switch (profile.driver) {
        case 'sqlite':
          (conn.handle as import('better-sqlite3').Database).prepare('SELECT 1').get();
          break;
        case 'postgresql':
          await (conn.handle as import('pg').Client).query('SELECT 1');
          break;
        case 'mysql':
          await (conn.handle as import('mysql2/promise').Connection).query('SELECT 1');
          break;
      }
      return { success: true, duration: Date.now() - start };
    } catch (err: unknown) {
      // Clean up failed connection
      connections.delete(profile.id);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // --- Query ---

  ipcMain.handle('db:query', async (_event, profileId: string, sql: string): Promise<DbQueryResult | { error: string }> => {
    const profiles = readProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return { error: 'Connection profile not found' };

    try {
      const conn = await getConnection(profile);
      const result = await executeQuery(conn, sql);

      // Save to history
      const history = readHistory();
      history.unshift({
        id: crypto.randomUUID(),
        connectionId: profileId,
        query: sql.trim(),
        timestamp: Date.now(),
      });
      // Keep last 200 entries
      writeHistory(history.slice(0, 200));

      return result;
    } catch (err: unknown) {
      // If connection was lost, remove cached handle so next attempt reconnects
      if (err instanceof Error && (err.message.includes('ECONNRESET') || err.message.includes('terminated') || err.message.includes('closed'))) {
        connections.delete(profileId);
      }
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // --- Schema ---

  ipcMain.handle('db:schema', async (_event, profileId: string): Promise<DbTable[] | { error: string }> => {
    const profiles = readProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return { error: 'Connection profile not found' };

    try {
      const conn = await getConnection(profile);
      return await getSchema(conn);
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // --- History ---

  ipcMain.handle('db:history:list', (_event, connectionId?: string) => {
    const all = readHistory();
    if (connectionId) return all.filter((e) => e.connectionId === connectionId);
    return all;
  });

  ipcMain.handle('db:history:clear', () => {
    writeHistory([]);
  });
}

// Cleanup on app quit
export function closeAllDbConnections(): void {
  for (const [id] of connections) {
    closeConnection(id);
  }
}
