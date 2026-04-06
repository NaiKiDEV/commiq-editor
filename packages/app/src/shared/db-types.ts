// Shared database types — imported by both main process (ipc/db.ts) and renderer (DatabaseClientPanel.tsx)

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
