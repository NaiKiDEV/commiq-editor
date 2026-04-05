import * as yaml from 'js-yaml';
import * as toml from 'smol-toml';
import { detectCsvDialect, parseCsv, csvToObjects } from './csv';

export type DataFormat = 'json' | 'yaml' | 'toml' | 'csv' | 'tsv';

export function detectFormat(text: string): DataFormat | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // JSON: starts with { or [
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // fall through
    }
  }

  // TOML: has key = value pairs or [section] headers before any YAML indicators
  try {
    const parsed = toml.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      // Prefer TOML only when it has clear TOML markers (= assignments or [sections])
      if (/^\s*\w[\w.-]*\s*=/m.test(trimmed) || /^\s*\[[\w.]+\]/m.test(trimmed)) {
        return 'toml';
      }
    }
  } catch {
    // fall through
  }

  // CSV / TSV: check before YAML because YAML is extremely permissive
  const csvDialect = detectCsvDialect(trimmed);
  if (csvDialect) {
    // Only claim CSV/TSV if there are at least 2 lines (header + data)
    // and the first 2 rows have the same column count
    const lines = trimmed.split(/\r?\n/);
    if (lines.length >= 2) {
      const delimiter = csvDialect === 'tsv' ? '\t' : ',';
      const firstCols = lines[0].split(delimiter).length;
      const secondCols = lines[1].split(delimiter).length;
      if (firstCols >= 2 && firstCols === secondCols) {
        return csvDialect;
      }
    }
  }

  // YAML: try last
  try {
    yaml.load(trimmed);
    return 'yaml';
  } catch {
    // fall through
  }

  return null;
}

export function validateFormat(text: string, format: DataFormat): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    if (format === 'json') JSON.parse(trimmed);
    else if (format === 'yaml') yaml.load(trimmed);
    else if (format === 'toml') toml.parse(trimmed);
    else if (format === 'csv' || format === 'tsv') {
      const result = parseCsv(trimmed, format);
      if (result.headers.length === 0) return 'No columns detected';
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function parseData(text: string, format: DataFormat): unknown {
  const trimmed = text.trim();
  if (format === 'json') return JSON.parse(trimmed);
  if (format === 'yaml') return yaml.load(trimmed);
  if (format === 'toml') return toml.parse(trimmed);
  if (format === 'csv' || format === 'tsv') {
    const csvData = parseCsv(trimmed, format);
    return csvToObjects(csvData);
  }
}
