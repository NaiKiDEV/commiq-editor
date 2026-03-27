export type TsStyle = 'type' | 'interface';

type TypeNode =
  | { kind: 'primitive'; type: 'string' | 'number' | 'boolean' | 'null' | 'undefined' }
  | { kind: 'object'; fields: Record<string, { node: TypeNode; optional: boolean }> }
  | { kind: 'array'; element: TypeNode }
  | { kind: 'union'; types: TypeNode[] };

function inferNode(value: unknown): TypeNode {
  if (value === null) return { kind: 'primitive', type: 'null' };
  if (typeof value === 'string') return { kind: 'primitive', type: 'string' };
  if (typeof value === 'number') return { kind: 'primitive', type: 'number' };
  if (typeof value === 'boolean') return { kind: 'primitive', type: 'boolean' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', element: { kind: 'primitive', type: 'undefined' } };
    return { kind: 'array', element: mergeTypes(value.map(inferNode)) };
  }
  if (typeof value === 'object') {
    const fields: Record<string, { node: TypeNode; optional: boolean }> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = { node: inferNode(v), optional: false };
    }
    return { kind: 'object', fields };
  }
  return { kind: 'primitive', type: 'string' };
}

function typeKey(node: TypeNode): string {
  if (node.kind === 'primitive') return node.type;
  if (node.kind === 'array') return `Array<${typeKey(node.element)}>`;
  if (node.kind === 'union') return node.types.map(typeKey).sort().join('|');
  if (node.kind === 'object')
    return `{${Object.entries(node.fields).map(([k, v]) => `${k}${v.optional ? '?' : ''}:${typeKey(v.node)}`).join(',')}}`;
  return 'unknown';
}

function mergeTypes(nodes: TypeNode[]): TypeNode {
  if (nodes.length === 0) return { kind: 'primitive', type: 'undefined' };
  if (nodes.length === 1) return nodes[0];

  const seen = new Map<string, TypeNode>();
  for (const n of nodes) seen.set(typeKey(n), n);
  const unique = [...seen.values()];
  if (unique.length === 1) return unique[0];

  const objects = unique.filter((n): n is Extract<TypeNode, { kind: 'object' }> => n.kind === 'object');
  const nonObjects = unique.filter((n) => n.kind !== 'object');

  if (objects.length > 1) {
    const allKeys = new Set(objects.flatMap((o) => Object.keys(o.fields)));
    const merged: Record<string, { node: TypeNode; optional: boolean }> = {};
    for (const key of allKeys) {
      const presentIn = objects.filter((o) => key in o.fields);
      const missingInSome = presentIn.length < objects.length;
      merged[key] = {
        node: mergeTypes(presentIn.map((o) => o.fields[key].node)),
        optional: missingInSome || presentIn.some((o) => o.fields[key].optional),
      };
    }
    const mergedObj: TypeNode = { kind: 'object', fields: merged };
    const all = nonObjects.length ? [...nonObjects, mergedObj] : [mergedObj];
    return all.length === 1 ? all[0] : { kind: 'union', types: all };
  }

  return { kind: 'union', types: unique };
}

function safePropName(k: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `"${k}"`;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toUpperCase());
}

// Resolve name conflicts by appending a number
function resolveName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  let i = 2;
  while (used.has(`${name}${i}`)) i++;
  return `${name}${i}`;
}

function emitDeclaration(name: string, bodyLines: string[], style: TsStyle): string {
  if (style === 'interface') return `interface ${name} {\n${bodyLines.join('\n')}\n}`;
  return `type ${name} = {\n${bodyLines.join('\n')}\n};`;
}

type EmitContext = {
  declarations: Map<string, string>; // name → declaration text
  usedNames: Set<string>;
  style: TsStyle;
  extract: boolean;
};

function emitType(node: TypeNode, indent: number, nameHint: string, ctx: EmitContext): string {
  const pad = '  '.repeat(indent);

  if (node.kind === 'primitive') return node.type;

  if (node.kind === 'union') {
    return node.types.map((t) => emitType(t, indent, nameHint, ctx)).join(' | ');
  }

  if (node.kind === 'array') {
    // Pass nameHint through to the element so arrays of objects get a named type
    const inner = emitType(node.element, indent, nameHint, ctx);
    return inner.includes(' | ') ? `(${inner})[]` : `${inner}[]`;
  }

  if (node.kind === 'object') {
    const entries = Object.entries(node.fields);
    if (entries.length === 0) return 'Record<string, unknown>';

    const shouldHoist = nameHint && (indent === 0 || ctx.extract);

    if (shouldHoist) {
      const name = resolveName(nameHint, ctx.usedNames);
      ctx.usedNames.add(name);

      const bodyLines = entries.map(([k, { node: v, optional }]) => {
        const childHint = toPascalCase(k);
        const inner = emitType(v, 1, childHint, ctx);
        return `  ${safePropName(k)}${optional ? '?' : ''}: ${inner};`;
      });

      ctx.declarations.set(name, emitDeclaration(name, bodyLines, ctx.style));
      return name;
    }

    // Inline object
    const bodyLines = entries.map(([k, { node: v, optional }]) => {
      const childHint = toPascalCase(k);
      const inner = emitType(v, indent + 1, childHint, ctx);
      return `${pad}  ${safePropName(k)}${optional ? '?' : ''}: ${inner};`;
    });
    return `{\n${bodyLines.join('\n')}\n${pad}}`;
  }

  return 'unknown';
}

export function inferTypeScript(
  data: unknown,
  rootName = 'Root',
  style: TsStyle = 'type',
  extract = false,
): string {
  const root = inferNode(data);
  const ctx: EmitContext = {
    declarations: new Map(),
    usedNames: new Set(),
    style,
    extract,
  };

  const rootType = emitType(root, 0, rootName, ctx);

  // Root was a primitive or inline — no declarations were created
  if (ctx.declarations.size === 0) {
    return style === 'interface'
      ? `// Cannot express primitive as interface\ntype ${rootName} = ${rootType};`
      : `type ${rootName} = ${rootType};`;
  }

  // Output dependencies before the root declaration
  const entries = [...ctx.declarations.entries()];
  const rootDecl = entries.find(([name]) => name === rootName);
  const deps = entries.filter(([name]) => name !== rootName);

  const ordered = [...deps.map(([, v]) => v), ...(rootDecl ? [rootDecl[1]] : [])];
  return ordered.join('\n\n');
}
