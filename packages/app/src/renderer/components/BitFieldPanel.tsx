import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, BookOpen, ChevronLeft, Edit2, Check, X, Copy } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

type BitWidth = 8 | 16 | 32 | 64;

export interface EnumEntry {
  value: number;
  label: string;
}

export interface FieldDef {
  id: string;
  name: string;
  msb: number;
  lsb: number;
  description: string;
  access: 'RW' | 'RO' | 'WO' | 'RC';
  enums: EnumEntry[];
}

export interface RegisterDef {
  id: string;
  name: string;
  description: string;
  width: BitWidth;
  fields: FieldDef[];
}

const FIELD_COLORS = [
  { bg: 'bg-blue-500/20',   border: 'border-blue-500/40',   text: 'text-blue-300',   bitBg: 'bg-blue-500/25',   bitText: 'text-blue-200'   },
  { bg: 'bg-green-500/20',  border: 'border-green-500/40',  text: 'text-green-300',  bitBg: 'bg-green-500/25',  bitText: 'text-green-200'  },
  { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-300', bitBg: 'bg-orange-500/25', bitText: 'text-orange-200' },
  { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-300', bitBg: 'bg-purple-500/25', bitText: 'text-purple-200' },
  { bg: 'bg-pink-500/20',   border: 'border-pink-500/40',   text: 'text-pink-300',   bitBg: 'bg-pink-500/25',   bitText: 'text-pink-200'   },
  { bg: 'bg-cyan-500/20',   border: 'border-cyan-500/40',   text: 'text-cyan-300',   bitBg: 'bg-cyan-500/25',   bitText: 'text-cyan-200'   },
  { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-300', bitBg: 'bg-yellow-500/25', bitText: 'text-yellow-200' },
  { bg: 'bg-red-500/20',    border: 'border-red-500/40',    text: 'text-red-300',    bitBg: 'bg-red-500/25',    bitText: 'text-red-200'    },
];

const RESERVED_COLOR = { bg: 'bg-muted/10', border: 'border-border', text: 'text-muted-foreground/30', bitBg: 'bg-muted/15', bitText: 'text-muted-foreground/30' };

function mask(width: BitWidth): bigint {
  return (1n << BigInt(width)) - 1n;
}

function fieldMask(msb: number, lsb: number): bigint {
  const bits = msb - lsb + 1;
  return ((1n << BigInt(bits)) - 1n) << BigInt(lsb);
}

function getFieldValue(raw: bigint, field: FieldDef): bigint {
  return (raw >> BigInt(field.lsb)) & ((1n << BigInt(field.msb - field.lsb + 1)) - 1n);
}

function setFieldValue(raw: bigint, field: FieldDef, value: bigint, width: BitWidth): bigint {
  const fm = fieldMask(field.msb, field.lsb);
  const shifted = (value << BigInt(field.lsb)) & fm;
  return ((raw & ~fm) | shifted) & mask(width);
}

function parseHex(s: string, width: BitWidth): bigint | null {
  const clean = s.replace(/^0x/i, '').replace(/[\s_]/g, '');
  if (!clean) return null;
  try { return BigInt('0x' + clean) & mask(width); } catch { return null; }
}

function buildColorMap(fields: FieldDef[]): Map<string, typeof FIELD_COLORS[0]> {
  const map = new Map<string, typeof FIELD_COLORS[0]>();
  let idx = 0;
  for (const f of fields) {
    map.set(f.id, FIELD_COLORS[idx % FIELD_COLORS.length]);
    idx++;
  }
  return map;
}

function buildBitOwner(fields: FieldDef[], width: BitWidth): (FieldDef | null)[] {
  const owner: (FieldDef | null)[] = Array(width).fill(null);
  for (const f of fields) {
    for (let b = f.lsb; b <= Math.min(f.msb, width - 1); b++) {
      owner[b] = f;
    }
  }
  return owner;
}

interface Segment {
  label: string;
  msb: number;
  lsb: number;
  bits: number;
  field: FieldDef | null; // null = reserved/unnamed
}

function buildSegments(fields: FieldDef[], width: BitWidth): Segment[] {
  // Sort fields by msb descending (left = MSB)
  const sorted = [...fields].sort((a, b) => b.msb - a.msb);
  const segs: Segment[] = [];
  let pos = width - 1; // current bit position (MSB first)

  for (const f of sorted) {
    if (f.msb < pos) {
      // Gap = reserved
      segs.push({ label: 'Reserved', msb: pos, lsb: f.msb + 1, bits: pos - f.msb, field: null });
    }
    segs.push({ label: f.name, msb: f.msb, lsb: f.lsb, bits: f.msb - f.lsb + 1, field: f });
    pos = f.lsb - 1;
  }
  if (pos >= 0) {
    segs.push({ label: 'Reserved', msb: pos, lsb: 0, bits: pos + 1, field: null });
  }
  return segs;
}

function SaveModal({
  initial,
  onSave,
  onCancel,
}: {
  initial: { name: string; description: string };
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.description);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-lg shadow-xl w-96 p-5 flex flex-col gap-4">
        <h3 className="text-sm font-medium">Save Register Definition</h3>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), desc); if (e.key === 'Escape') onCancel(); }}
            className="bg-muted/40 border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            placeholder="e.g. UART_CR"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description (optional)</label>
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), desc); if (e.key === 'Escape') onCancel(); }}
            className="bg-muted/40 border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            placeholder="e.g. UART Control Register"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="xs" onClick={onCancel}>Cancel</Button>
          <Button size="xs" onClick={() => name.trim() && onSave(name.trim(), desc)} disabled={!name.trim()}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function FieldForm({
  initial,
  width,
  usedBits,
  onSubmit,
  onCancel,
}: {
  initial?: FieldDef;
  width: BitWidth;
  usedBits: Set<number>;
  onSubmit: (f: FieldDef) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [msb, setMsb] = useState(initial ? String(initial.msb) : '');
  const [lsb, setLsb] = useState(initial ? String(initial.lsb) : '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [access, setAccess] = useState<FieldDef['access']>(initial?.access ?? 'RW');
  const [enums, setEnums] = useState<EnumEntry[]>(initial?.enums ?? []);
  const [enumVal, setEnumVal] = useState('');
  const [enumLabel, setEnumLabel] = useState('');

  const msbN = parseInt(msb);
  const lsbN = parseInt(lsb);
  const valid =
    name.trim() &&
    !isNaN(msbN) && !isNaN(lsbN) &&
    msbN >= lsbN &&
    msbN < width && lsbN >= 0 &&
    !Array.from({ length: msbN - lsbN + 1 }, (_, i) => lsbN + i)
      .some((b) => usedBits.has(b));

  const addEnum = () => {
    const v = parseInt(enumVal);
    if (isNaN(v) || !enumLabel.trim()) return;
    setEnums((prev) => [...prev.filter((e) => e.value !== v), { value: v, label: enumLabel.trim() }]);
    setEnumVal('');
    setEnumLabel('');
  };

  const submit = () => {
    if (!valid) return;
    onSubmit({
      id: initial?.id ?? uuidv4(),
      name: name.trim(),
      msb: msbN,
      lsb: lsbN,
      description: desc.trim(),
      access,
      enums: [...enums].sort((a, b) => a.value - b.value),
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-muted/20 border border-border rounded-lg">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {initial ? 'Edit Field' : 'Add Field'}
      </span>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ENABLE"
            className="bg-muted/40 border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground">Access</label>
          <Select value={access} onValueChange={(v) => setAccess(v as FieldDef['access'])}>
            <SelectTrigger className="text-xs h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RW">RW — Read/Write</SelectItem>
              <SelectItem value="RO">RO — Read Only</SelectItem>
              <SelectItem value="WO">WO — Write Only</SelectItem>
              <SelectItem value="RC">RC — Read/Clear</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground">MSB (hi bit)</label>
          <input
            value={msb}
            onChange={(e) => setMsb(e.target.value)}
            placeholder={String(width - 1)}
            className="bg-muted/40 border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground">LSB (lo bit)</label>
          <input
            value={lsb}
            onChange={(e) => setLsb(e.target.value)}
            placeholder="0"
            className="bg-muted/40 border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground">Width</label>
          <div className="flex items-center h-[26px] px-2 bg-muted/20 border border-border rounded text-xs font-mono text-muted-foreground">
            {(!isNaN(msbN) && !isNaN(lsbN) && msbN >= lsbN) ? `${msbN - lsbN + 1} bit${msbN !== lsbN ? 's' : ''}` : '—'}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">Description (optional)</label>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What does this field control?"
          className="bg-muted/40 border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
        />
      </div>

      {/* Enum values */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-muted-foreground">Enum Values (optional)</label>
        {enums.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {enums.map((e) => (
              <div key={e.value} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-muted-foreground/60 w-4 text-right">{e.value}</span>
                <span className="text-muted-foreground/40">→</span>
                <span className="flex-1 text-foreground">{e.label}</span>
                <button onClick={() => setEnums((prev) => prev.filter((x) => x.value !== e.value))} className="text-muted-foreground/40 hover:text-red-400">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input
            value={enumVal}
            onChange={(e) => setEnumVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addEnum(); }}
            placeholder="0"
            className="w-12 bg-muted/40 border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-ring"
          />
          <span className="text-muted-foreground/40 text-xs">→</span>
          <input
            value={enumLabel}
            onChange={(e) => setEnumLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addEnum(); }}
            placeholder="Label"
            className="flex-1 bg-muted/40 border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
          />
          <Button variant="ghost" size="icon-xs" onClick={addEnum} disabled={!enumLabel.trim() || isNaN(parseInt(enumVal))}>
            <Plus className="size-3" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={submit} disabled={!valid}>
          {initial ? 'Update' : 'Add Field'}
        </Button>
      </div>
    </div>
  );
}

function LibraryView({
  library,
  onLoad,
  onDelete,
  onBack,
}: {
  library: RegisterDef[];
  onLoad: (r: RegisterDef) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-xs font-medium">Register Library</span>
        <span className="text-xs text-muted-foreground ml-1">({library.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {library.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">
            No saved registers yet
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {library.map((reg) => (
              <div key={reg.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-foreground">{reg.name}</span>
                    <span className="text-[10px] text-muted-foreground/50 border border-border rounded px-1">{reg.width}-bit</span>
                    <span className="text-[10px] text-muted-foreground/50">{reg.fields.length} field{reg.fields.length !== 1 ? 's' : ''}</span>
                  </div>
                  {reg.description && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{reg.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="xs" onClick={() => onLoad(reg)}>Load</Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDelete(reg.id)}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BitFieldPanel({ panelId: _panelId }: { panelId: string }) {
  const [view, setView] = useState<'editor' | 'library'>('editor');
  const [width, setWidth] = useState<BitWidth>(32);
  const [rawBits, setRawBits] = useState<bigint>(0n);
  const [hexInput, setHexInput] = useState('00000000');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [library, setLibrary] = useState<RegisterDef[]>([]);
  const [showAddField, setShowAddField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [savedDesc, setSavedDesc] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.registers.load().then((raw) => {
      if (Array.isArray(raw)) setLibrary(raw as RegisterDef[]);
    }).catch(() => {});
  }, []);

  const saveLibrary = useCallback((updated: RegisterDef[]) => {
    setLibrary(updated);
    window.electronAPI.registers.save(updated).catch(() => {});
  }, []);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  const applyRaw = useCallback((val: bigint, w: BitWidth) => {
    const masked = val & mask(w);
    setRawBits(masked);
    setHexInput(masked.toString(16).toUpperCase().padStart(w / 4, '0'));
  }, []);

  const handleHexChange = useCallback((s: string) => {
    setHexInput(s);
    const parsed = parseHex(s, width);
    if (parsed !== null) setRawBits(parsed);
  }, [width]);

  const handleWidthChange = useCallback((w: BitWidth) => {
    setWidth(w);
    applyRaw(rawBits, w);
    // Drop fields that exceed new width
    setFields((prev) => prev.filter((f) => f.lsb < w).map((f) => ({ ...f, msb: Math.min(f.msb, w - 1) })));
  }, [rawBits, applyRaw]);

  const handleBitToggle = useCallback((bitIndex: number) => {
    applyRaw(rawBits ^ (1n << BigInt(bitIndex)), width);
  }, [rawBits, width, applyRaw]);

  const handleFieldValueChange = useCallback((field: FieldDef, value: bigint) => {
    applyRaw(setFieldValue(rawBits, field, value, width), width);
  }, [rawBits, width, applyRaw]);

  const addField = useCallback((f: FieldDef) => {
    setFields((prev) => [...prev, f]);
    setShowAddField(false);
  }, []);

  const updateField = useCallback((f: FieldDef) => {
    setFields((prev) => prev.map((x) => x.id === f.id ? f : x));
    setEditingFieldId(null);
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (editingFieldId === id) setEditingFieldId(null);
  }, [editingFieldId]);

  const handleSave = useCallback((name: string, desc: string) => {
    setSavedName(name);
    setSavedDesc(desc);
    const reg: RegisterDef = { id: uuidv4(), name, description: desc, width, fields };
    const existing = library.findIndex((r) => r.name === name);
    const updated = existing >= 0
      ? library.map((r, i) => i === existing ? { ...reg, id: r.id } : r)
      : [...library, reg];
    saveLibrary(updated);
    setSaveModal(false);
  }, [width, fields, library, saveLibrary]);

  const handleLoad = useCallback((reg: RegisterDef) => {
    setWidth(reg.width);
    setFields(reg.fields);
    setSavedName(reg.name);
    setSavedDesc(reg.description);
    applyRaw(rawBits, reg.width);
    setView('editor');
    setShowAddField(false);
    setEditingFieldId(null);
  }, [rawBits, applyRaw]);

  const handleDelete = useCallback((id: string) => {
    saveLibrary(library.filter((r) => r.id !== id));
  }, [library, saveLibrary]);

  const colorMap = useMemo(() => buildColorMap(fields), [fields]);
  const bitOwner = useMemo(() => buildBitOwner(fields, width), [fields, width]);
  const segments = useMemo(() => buildSegments(fields, width), [fields, width]);
  const bitString = rawBits.toString(2).padStart(width, '0');

  const usedBits = useMemo(() => {
    const s = new Set<number>();
    for (const f of fields) {
      for (let b = f.lsb; b <= f.msb; b++) s.add(b);
    }
    return s;
  }, [fields]);

  const usedBitsForEdit = useMemo(() => {
    if (!editingFieldId) return usedBits;
    const editing = fields.find((f) => f.id === editingFieldId);
    if (!editing) return usedBits;
    const s = new Set(usedBits);
    for (let b = editing.lsb; b <= editing.msb; b++) s.delete(b);
    return s;
  }, [usedBits, editingFieldId, fields]);

  const hexStr = '0x' + rawBits.toString(16).toUpperCase().padStart(width / 4, '0');

  if (view === 'library') {
    return (
      <LibraryView
        library={library}
        onLoad={handleLoad}
        onDelete={handleDelete}
        onBack={() => setView('editor')}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {saveModal && (
        <SaveModal
          initial={{ name: savedName, description: savedDesc }}
          onSave={handleSave}
          onCancel={() => setSaveModal(false)}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border flex-wrap shrink-0">
        {/* Width */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Width</span>
          {([8, 16, 32, 64] as BitWidth[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWidthChange(w)}
              className={cn(
                'px-2 py-0.5 rounded text-xs border font-mono transition-colors',
                width === w
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              )}
            >
              {w}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setView('library')}>
            <BookOpen className="size-3" />
            Library ({library.length})
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setSaveModal(true)} disabled={fields.length === 0}>
            <Save className="size-3" />
            Save
          </Button>
        </div>
      </div>

      {/* Raw hex input */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Raw Value</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">0x</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              onFocus={(e) => e.target.select()}
              spellCheck={false}
              className="flex-1 min-w-0 bg-muted/40 border border-border rounded px-2 py-1.5 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            />
            <button onClick={() => copy(hexStr, 'raw')} className="shrink-0 p-1.5 rounded hover:bg-muted/40 transition-colors">
              {copiedKey === 'raw' ? <Check className="size-3 text-green-400" /> : <Copy className="size-3 text-muted-foreground" />}
            </button>
          </div>
        </div>
      </div>

      {/* Field map */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Field Map</span>
        <div className="flex w-full rounded overflow-hidden border border-border" style={{ minHeight: 40 }}>
          {segments.map((seg, i) => {
            const pct = (seg.bits / width) * 100;
            const color = seg.field ? colorMap.get(seg.field.id) ?? RESERVED_COLOR : RESERVED_COLOR;
            const fieldValue = seg.field ? getFieldValue(rawBits, seg.field) : null;
            const enumLabel = seg.field && seg.field.enums.length > 0
              ? seg.field.enums.find((e) => BigInt(e.value) === fieldValue)?.label
              : null;
            return (
              <div
                key={i}
                className={cn('flex flex-col items-center justify-center px-1 border-r last:border-r-0 border-border overflow-hidden', color.bg)}
                style={{ width: `${pct}%` }}
                title={`${seg.label} [${seg.msb}:${seg.lsb}] = ${fieldValue ?? '—'}`}
              >
                <span className={cn('text-[9px] font-mono truncate w-full text-center leading-tight', color.text)}>
                  {seg.bits >= 2 ? seg.label : ''}
                </span>
                {seg.field && (
                  <span className={cn('text-[9px] font-mono truncate w-full text-center leading-tight', color.text, 'opacity-70')}>
                    {enumLabel ?? (fieldValue !== null ? fieldValue.toString() : '')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Bit range labels */}
        <div className="flex w-full text-[8px] text-muted-foreground/30 font-mono select-none">
          {segments.map((seg, i) => {
            const pct = (seg.bits / width) * 100;
            return (
              <div key={i} className="flex justify-between overflow-hidden" style={{ width: `${pct}%` }}>
                <span>{seg.msb}</span>
                {seg.bits > 1 && <span>{seg.lsb}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bit grid */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bit Pattern</span>
        <div className="flex flex-col gap-1.5 font-mono">
          {Array.from({ length: width / 8 }, (_, byteIdx) => {
            const byteNum = width / 8 - 1 - byteIdx;
            return (
              <div key={byteIdx} className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground/40 w-8 text-right shrink-0 select-none">B{byteNum}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 8 }, (_, bitInByte) => {
                    const strIdx = byteIdx * 8 + bitInByte;
                    const bitIndex = width - 1 - strIdx;
                    const isOne = bitString[strIdx] === '1';
                    const owner = bitOwner[bitIndex];
                    const color = owner ? (colorMap.get(owner.id) ?? RESERVED_COLOR) : RESERVED_COLOR;
                    return (
                      <button
                        key={bitInByte}
                        onClick={() => handleBitToggle(bitIndex)}
                        title={owner ? `Bit ${bitIndex} — ${owner.name}` : `Bit ${bitIndex} — unassigned`}
                        className={cn(
                          'w-9 h-9 rounded text-xs font-mono border transition-colors select-none',
                          isOne
                            ? cn(color.bitBg, color.border, color.bitText)
                            : owner
                            ? cn('border-border', color.bitBg, 'opacity-40 hover:opacity-70', color.bitText)
                            : 'bg-muted/10 border-border text-muted-foreground/20 hover:border-muted-foreground/30',
                        )}
                      >
                        {isOne ? '1' : '0'}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[9px] text-muted-foreground/40 shrink-0 select-none font-mono">
                  {parseInt(bitString.slice(byteIdx * 8, byteIdx * 8 + 8), 2).toString(16).toUpperCase().padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fields table */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fields</span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => { setShowAddField(true); setEditingFieldId(null); }}
            disabled={showAddField || usedBits.size >= width}
          >
            <Plus className="size-3" />
            Add Field
          </Button>
        </div>

        {fields.length === 0 && !showAddField && (
          <p className="text-xs text-muted-foreground/40 py-2">
            No fields defined. Add a field to start decoding register bits.
          </p>
        )}

        {/* Existing fields */}
        {fields.length > 0 && (
          <div className="flex flex-col gap-1">
            {[...fields].sort((a, b) => b.msb - a.msb).map((field) => {
              const color = colorMap.get(field.id) ?? RESERVED_COLOR;
              const value = getFieldValue(rawBits, field);
              const maxVal = (1n << BigInt(field.msb - field.lsb + 1)) - 1n;
              const enumEntry = field.enums.find((e) => BigInt(e.value) === value);

              if (editingFieldId === field.id) {
                return (
                  <FieldForm
                    key={field.id}
                    initial={field}
                    width={width}
                    usedBits={usedBitsForEdit}
                    onSubmit={updateField}
                    onCancel={() => setEditingFieldId(null)}
                  />
                );
              }

              return (
                <div key={field.id} className="flex items-center gap-2 group rounded hover:bg-muted/20 px-2 py-1.5">
                  {/* Color swatch */}
                  <div className={cn('w-2 h-6 rounded-sm shrink-0', color.bg, color.border, 'border')} />

                  {/* Name + bits */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs font-mono font-medium', color.text)}>{field.name}</span>
                      <span className="text-[9px] text-muted-foreground/50 font-mono">
                        [{field.msb}:{field.lsb}]
                      </span>
                      <span className="text-[9px] text-muted-foreground/40 border border-border rounded px-1">
                        {field.access}
                      </span>
                    </div>
                    {field.description && (
                      <span className="text-[10px] text-muted-foreground/50 truncate">{field.description}</span>
                    )}
                  </div>

                  {/* Value editor */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {field.enums.length > 0 ? (
                      <Select
                        value={String(Number(value))}
                        onValueChange={(v) => handleFieldValueChange(field, BigInt(v))}
                      >
                        <SelectTrigger className="text-xs h-7 font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.enums.map((e) => (
                            <SelectItem key={e.value} value={String(e.value)}>{e.value} — {e.label}</SelectItem>
                          ))}
                          {!field.enums.find((e) => BigInt(e.value) === value) && (
                            <SelectItem value={String(Number(value))}>{Number(value)} — (unnamed)</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={Number(maxVal)}
                        value={Number(value)}
                        onChange={(e) => {
                          const v = BigInt(e.target.value);
                          if (v >= 0n && v <= maxVal) handleFieldValueChange(field, v);
                        }}
                        className="w-20 bg-muted/40 border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-ring text-right"
                      />
                    )}
                    {enumEntry && field.enums.length > 0 && (
                      <span className={cn('text-[10px]', color.text)}>{enumEntry.label}</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingFieldId(field.id); setShowAddField(false); }}
                      className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="size-3" />
                    </button>
                    <button
                      onClick={() => removeField(field.id)}
                      className="p-1.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add field form */}
        {showAddField && (
          <FieldForm
            width={width}
            usedBits={usedBits}
            onSubmit={addField}
            onCancel={() => setShowAddField(false)}
          />
        )}
      </div>
    </div>
  );
}
