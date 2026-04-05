/* ------------------------------------------------------------------ */
/*  CSV / TSV parsing, serialisation & column-type detection          */
/* ------------------------------------------------------------------ */

export type CsvDialect = 'csv' | 'tsv';

export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'null' | 'mixed';

export interface CsvData {
  headers: string[];
  rows: string[][];
  dialect: CsvDialect;
  columnTypes: ColumnType[];
}

/* ---- detection --------------------------------------------------- */

/** Quick sniff: is the text likely CSV or TSV? */
export function detectCsvDialect(text: string): CsvDialect | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Grab first few lines (max 10) to sample
  const lines = trimmed.split(/\r?\n/).slice(0, 10);
  if (lines.length === 0) return null;

  // Count tabs vs commas in the first non-empty line
  const first = lines[0];
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;

  // Need at least one delimiter to decide
  if (tabs === 0 && commas === 0) return null;
  return tabs >= commas ? 'tsv' : 'csv';
}

/* ---- parsing ----------------------------------------------------- */

/**
 * RFC-4180-ish CSV parser supporting:
 *  - quoted fields (double-quote escaping)
 *  - CRLF / LF line endings
 *  - configurable delimiter
 */
export function parseCsv(text: string, dialect: CsvDialect = 'csv'): CsvData {
  const delimiter = dialect === 'tsv' ? '\t' : ',';
  const rows = parseRows(text.trim(), delimiter);

  if (rows.length === 0) {
    return { headers: [], rows: [], dialect, columnTypes: [] };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const columnTypes = inferColumnTypes(headers, dataRows);

  return { headers, rows: dataRows, dialect, columnTypes };
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const { row, nextIndex } = parseRow(text, i, delimiter);
    rows.push(row);
    i = nextIndex;
  }

  // Drop trailing empty row if present
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
  }

  return rows;
}

function parseRow(
  text: string,
  start: number,
  delimiter: string,
): { row: string[]; nextIndex: number } {
  const fields: string[] = [];
  let i = start;
  const len = text.length;

  while (i < len) {
    if (text[i] === '"') {
      // Quoted field
      const { value, nextIndex } = parseQuotedField(text, i);
      fields.push(value);
      i = nextIndex;
      // skip delimiter or newline after quoted field
      if (i < len && text[i] === delimiter) {
        i++;
      } else if (i < len && (text[i] === '\r' || text[i] === '\n')) {
        if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i += 2;
        else i++;
        break;
      }
    } else {
      // Unquoted field — read until delimiter or newline
      let end = i;
      while (end < len && text[end] !== delimiter && text[end] !== '\r' && text[end] !== '\n') {
        end++;
      }
      fields.push(text.slice(i, end));
      i = end;
      if (i < len && text[i] === delimiter) {
        i++;
        // if delimiter is last char before newline / EOF, push empty trailing field
        if (i >= len || text[i] === '\r' || text[i] === '\n') {
          fields.push('');
        }
      } else if (i < len && (text[i] === '\r' || text[i] === '\n')) {
        if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i += 2;
        else i++;
        break;
      }
    }
  }

  return { row: fields, nextIndex: i };
}

function parseQuotedField(
  text: string,
  start: number,
): { value: string; nextIndex: number } {
  let i = start + 1; // skip opening quote
  const len = text.length;
  let value = '';

  while (i < len) {
    if (text[i] === '"') {
      if (i + 1 < len && text[i + 1] === '"') {
        value += '"';
        i += 2;
      } else {
        i++; // skip closing quote
        break;
      }
    } else {
      value += text[i];
      i++;
    }
  }

  return { value, nextIndex: i };
}

/* ---- column-type inference --------------------------------------- */

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function inferColumnTypes(headers: string[], rows: string[][]): ColumnType[] {
  return headers.map((_, colIdx) => inferSingleColumn(rows, colIdx));
}

function inferSingleColumn(rows: string[][], colIdx: number): ColumnType {
  const types = new Set<ColumnType>();
  let nonEmpty = 0;

  for (const row of rows) {
    const cell = row[colIdx] ?? '';
    if (cell === '') {
      types.add('null');
      continue;
    }
    nonEmpty++;
    types.add(classifyCell(cell));
  }

  if (nonEmpty === 0) return 'null';
  types.delete('null'); // ignore null when mixed with real types
  if (types.size === 0) return 'null';
  if (types.size === 1) return [...types][0];
  return 'mixed';
}

function classifyCell(value: string): ColumnType {
  // boolean
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === 'false') return 'boolean';

  // number (integers, floats, scientific, negative)
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) return 'number';

  // date
  if (ISO_DATE_RE.test(value)) return 'date';

  return 'string';
}

/* ---- serialisation ----------------------------------------------- */

export function serializeCsv(data: CsvData): string {
  const delimiter = data.dialect === 'tsv' ? '\t' : ',';
  const rows = [data.headers, ...data.rows];
  return rows.map((row) => row.map((cell) => quoteField(cell, delimiter)).join(delimiter)).join('\n');
}

function quoteField(field: string, delimiter: string): string {
  if (field.includes('"') || field.includes(delimiter) || field.includes('\n') || field.includes('\r')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/* ---- CSV ↔ JSON / objects ---------------------------------------- */

/** Convert CSV rows to an array of plain objects (keys = headers). */
export function csvToObjects(data: CsvData): Record<string, unknown>[] {
  return data.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < data.headers.length; i++) {
      obj[data.headers[i]] = coerceValue(row[i] ?? '', data.columnTypes[i]);
    }
    return obj;
  });
}

function coerceValue(raw: string, colType: ColumnType): unknown {
  if (raw === '') return null;
  switch (colType) {
    case 'number':
      return Number(raw);
    case 'boolean':
      return raw.toLowerCase() === 'true';
    default:
      return raw;
  }
}

/** Convert an array of objects back to CsvData. */
export function objectsToCsv(data: unknown, dialect: CsvDialect = 'csv'): CsvData {
  if (!Array.isArray(data) || data.length === 0) {
    return { headers: [], rows: [], dialect, columnTypes: [] };
  }

  // Collect all unique keys across objects
  const headerSet = new Set<string>();
  for (const item of data) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        headerSet.add(key);
      }
    }
  }
  const headers = [...headerSet];

  const rows = data.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return headers.map(() => '');
    }
    const obj = item as Record<string, unknown>;
    return headers.map((h) => {
      const v = obj[h];
      if (v === null || v === undefined) return '';
      return String(v);
    });
  });

  const columnTypes = inferColumnTypes(headers, rows);
  return { headers, rows, dialect, columnTypes };
}

/* ---- sorting helpers --------------------------------------------- */

export type SortDir = 'asc' | 'desc' | null;

export function sortRows(
  rows: string[][],
  colIdx: number,
  dir: SortDir,
  colType: ColumnType,
): string[][] {
  if (dir === null) return rows;
  const sorted = [...rows].sort((a, b) => {
    const va = a[colIdx] ?? '';
    const vb = b[colIdx] ?? '';
    let cmp: number;
    if (colType === 'number') {
      cmp = (parseFloat(va) || 0) - (parseFloat(vb) || 0);
    } else {
      cmp = va.localeCompare(vb, undefined, { sensitivity: 'base' });
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

/** Filter rows: keep rows where at least one cell contains the query (case-insensitive). */
export function filterRows(rows: string[][], query: string): string[][] {
  if (!query.trim()) return rows;
  const lower = query.toLowerCase();
  return rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(lower)));
}
