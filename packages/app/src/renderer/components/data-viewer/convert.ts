import * as yaml from 'js-yaml';
import * as toml from 'smol-toml';
import type { DataFormat } from './detect';
import { parseData } from './detect';

export function convertData(text: string, from: DataFormat, to: DataFormat): string {
  if (from === to) return text;
  const data = parseData(text, from);
  return serialize(data, to);
}

export function serialize(data: unknown, format: DataFormat): string {
  if (format === 'json') return JSON.stringify(data, null, 2);
  if (format === 'yaml') return yaml.dump(data, { indent: 2, lineWidth: -1 });
  if (format === 'toml') return toml.stringify(data as Record<string, unknown>);
  return '';
}
