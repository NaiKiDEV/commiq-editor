import * as yaml from 'js-yaml';
import * as toml from 'smol-toml';

export type DataFormat = 'json' | 'yaml' | 'toml';

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
}
