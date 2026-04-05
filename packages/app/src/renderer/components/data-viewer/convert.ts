import * as yaml from 'js-yaml';
import * as toml from 'smol-toml';
import type { DataFormat } from './detect';
import { parseData } from './detect';
import { parseCsv, csvToObjects, objectsToCsv, serializeCsv, type CsvDialect } from './csv';

export function convertData(text: string, from: DataFormat, to: DataFormat): string {
  if (from === to) return text;

  // When converting FROM csv/tsv, parse to objects first
  if (from === 'csv' || from === 'tsv') {
    const csvData = parseCsv(text.trim(), from);
    const objects = csvToObjects(csvData);

    if (to === 'csv' || to === 'tsv') {
      // CSV→TSV or TSV→CSV: re-serialize with new dialect
      return serializeCsv({ ...csvData, dialect: to as CsvDialect });
    }
    return serialize(objects, to);
  }

  // When converting TO csv/tsv from a structured format
  if (to === 'csv' || to === 'tsv') {
    const data = parseData(text, from);
    if (!Array.isArray(data)) {
      throw new Error('Cannot convert to CSV: data must be an array of objects');
    }
    const csvData = objectsToCsv(data, to as CsvDialect);
    if (csvData.headers.length === 0) {
      throw new Error('Cannot convert to CSV: no columns detected');
    }
    return serializeCsv(csvData);
  }

  const data = parseData(text, from);
  return serialize(data, to);
}

export function serialize(data: unknown, format: DataFormat): string {
  if (format === 'json') return JSON.stringify(data, null, 2);
  if (format === 'yaml') return yaml.dump(data, { indent: 2, lineWidth: -1 });
  if (format === 'toml') return toml.stringify(data as Record<string, unknown>);
  if (format === 'csv' || format === 'tsv') {
    const csvData = objectsToCsv(data, format as CsvDialect);
    return serializeCsv(csvData);
  }
  return '';
}
