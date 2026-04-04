import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, RefreshCw, Plus, X, Hash, Globe } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '@/lib/utils';

// ── helpers ──────────────────────────────────────────────────────────────────

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function epochToDate(epoch: number): Date {
  return new Date(epoch * 1000);
}

function dateToEpoch(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function toLocalIso(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function humanRelative(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;

  const units: [number, string][] = [
    [365 * 24 * 3600 * 1000, 'year'],
    [30 * 24 * 3600 * 1000, 'month'],
    [24 * 3600 * 1000, 'day'],
    [3600 * 1000, 'hour'],
    [60 * 1000, 'minute'],
    [1000, 'second'],
  ];

  for (const [ms, unit] of units) {
    const n = Math.floor(abs / ms);
    if (n >= 1) {
      return past ? `${n} ${unit}${n !== 1 ? 's' : ''} ago` : `in ${n} ${unit}${n !== 1 ? 's' : ''}`;
    }
  }
  return 'just now';
}

function formatInZone(date: Date, tz: string): { time: string; offset: string; label: string } {
  try {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);

    const parts = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const label = tz === 'UTC' ? 'UTC' : tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;

    return { time, offset, label };
  } catch {
    return { time: '—', offset: '', label: tz };
  }
}

function validateTz(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

const TZ_SUGGESTIONS = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'Europe/Rome', 'Europe/Madrid', 'Europe/Stockholm', 'Europe/Warsaw',
  'Europe/Moscow', 'Europe/Istanbul',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
  'Pacific/Honolulu', 'Africa/Cairo', 'Africa/Johannesburg',
];

// ── copy hook ─────────────────────────────────────────────────────────────────

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);
  return { copiedKey, copy };
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  colorClass,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  colorClass: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div className={cn('flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold', colorClass)}>
        {icon}
        {label}
      </div>
      {action}
    </div>
  );
}

function FormatCard({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (v: string, k: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <button
      onClick={() => onCopy(value, copyKey)}
      className="group flex flex-col gap-1 p-2.5 rounded-lg bg-muted/20 border border-border/50 hover:border-info/30 hover:bg-info/5 transition-all text-left"
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-info/70 font-semibold">{label}</span>
        <span className={cn('transition-opacity', copied ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')}>
          {copied
            ? <Check className="size-2.5 text-green-400" />
            : <Copy className="size-2.5 text-muted-foreground" />}
        </span>
      </div>
      <span className="font-mono text-[11px] text-foreground/90 truncate w-full">{value}</span>
    </button>
  );
}

// ── main panel ────────────────────────────────────────────────────────────────

export function EpochPanel({ panelId: _panelId }: { panelId: string }) {
  const [epochInput, setEpochInput] = useState(() => String(nowEpoch()));
  const [dateInput, setDateInput] = useState(() => toLocalIso(new Date()));
  const [addValue, setAddValue] = useState('');
  const [addUnit, setAddUnit] = useState<'seconds' | 'minutes' | 'hours' | 'days' | 'weeks'>('days');
  const [liveMode, setLiveMode] = useState(false);
  const [timezones, setTimezones] = useState<string[]>(DEFAULT_TIMEZONES);
  const [addingTz, setAddingTz] = useState(false);
  const [tzInput, setTzInput] = useState('');
  const [tzError, setTzError] = useState('');
  const tzInputRef = useRef<HTMLInputElement>(null);
  const { copiedKey, copy } = useCopy();

  // Live tick
  useEffect(() => {
    if (!liveMode) return;
    const id = setInterval(() => {
      const now = nowEpoch();
      setEpochInput(String(now));
      setDateInput(toLocalIso(new Date(now * 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [liveMode]);

  // Focus tz input when it opens
  useEffect(() => {
    if (addingTz) setTimeout(() => tzInputRef.current?.focus(), 50);
  }, [addingTz]);

  const date = useMemo(() => {
    const n = Number(epochInput);
    if (!isNaN(n) && epochInput.trim() !== '') return epochToDate(n);
    return null;
  }, [epochInput]);

  const handleEpochChange = useCallback((value: string) => {
    setLiveMode(false);
    setEpochInput(value);
    const n = Number(value);
    if (!isNaN(n) && value.trim() !== '') setDateInput(toLocalIso(new Date(n * 1000)));
  }, []);

  const handleDateChange = useCallback((value: string) => {
    setLiveMode(false);
    setDateInput(value);
    const d = new Date(value);
    if (!isNaN(d.getTime())) setEpochInput(String(dateToEpoch(d)));
  }, []);

  const handleNow = useCallback(() => {
    const now = nowEpoch();
    setEpochInput(String(now));
    setDateInput(toLocalIso(new Date(now * 1000)));
    setLiveMode(false);
  }, []);

  const handleAdd = useCallback(() => {
    const n = Number(addValue);
    if (isNaN(n) || !date) return;
    const msMap = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
    const newDate = new Date(date.getTime() + n * msMap[addUnit]);
    setEpochInput(String(dateToEpoch(newDate)));
    setDateInput(toLocalIso(newDate));
  }, [addValue, addUnit, date]);

  const handleAddTz = useCallback(() => {
    const tz = tzInput.trim();
    if (!tz) return;
    if (!validateTz(tz)) { setTzError('Invalid IANA timezone'); return; }
    if (timezones.includes(tz)) { setTzError('Already added'); return; }
    setTimezones((prev) => [...prev, tz]);
    setTzInput('');
    setTzError('');
    setAddingTz(false);
  }, [tzInput, timezones]);

  const handleRemoveTz = useCallback((tz: string) => {
    setTimezones((prev) => prev.filter((t) => t !== tz));
  }, []);

  const isFuture = date ? date.getTime() > Date.now() : false;
  const relativeText = date ? humanRelative(date) : null;

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">

      {/* ── Converter hero ─────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2">
        <div className="rounded-xl border border-border/60 overflow-hidden bg-muted/10">
          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/40">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setLiveMode((v) => !v);
                  if (!liveMode) {
                    const now = nowEpoch();
                    setEpochInput(String(now));
                    setDateInput(toLocalIso(new Date(now * 1000)));
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all',
                  liveMode
                    ? 'bg-success/15 border-success/40 text-success'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', liveMode ? 'bg-success animate-pulse' : 'bg-muted-foreground/50')} />
                Live
              </button>
              <Button variant="ghost" size="xs" onClick={handleNow} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="size-3" />
                Now
              </Button>
            </div>

            {relativeText && (
              <span className={cn(
                'text-[10px] font-mono px-2 py-0.5 rounded-full border font-medium',
                isFuture
                  ? 'bg-warning/10 border-warning/25 text-warning'
                  : 'bg-success/10 border-success/25 text-success',
              )}>
                {relativeText}
              </span>
            )}
          </div>

          {/* Epoch input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-medium">Unix (seconds)</span>
              <input
                type="number"
                value={epochInput}
                onChange={(e) => handleEpochChange(e.target.value)}
                className="bg-transparent font-mono text-base font-medium text-foreground outline-none w-full placeholder:text-muted-foreground/30"
                placeholder="1700000000"
              />
            </div>
            <button
              onClick={() => copy(epochInput, 'epoch')}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              {copiedKey === 'epoch' ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            </button>
          </div>

          {/* Datetime input */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-medium">Local date & time</span>
              <input
                type="datetime-local"
                value={dateInput}
                onChange={(e) => handleDateChange(e.target.value)}
                step="1"
                className="bg-transparent font-mono text-sm text-foreground outline-none w-full"
              />
            </div>
            <button
              onClick={() => copy(dateInput, 'datetime')}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              {copiedKey === 'datetime' ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Formats ────────────────────────────────────────────────────── */}
      {date && (
        <div className="flex flex-col border-t border-border/40">
          <SectionHeader icon={<Hash className="size-2.5" />} label="Formats" colorClass="text-info" />
          <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
            <FormatCard label="ISO 8601" value={date.toISOString()} copyKey="iso" copiedKey={copiedKey} onCopy={copy} />
            <FormatCard label="UTC" value={date.toUTCString()} copyKey="utc" copiedKey={copiedKey} onCopy={copy} />
            <FormatCard label="Local" value={date.toLocaleString()} copyKey="local" copiedKey={copiedKey} onCopy={copy} />
            <FormatCard label="Epoch ms" value={String(date.getTime())} copyKey="ms" copiedKey={copiedKey} onCopy={copy} />
            <FormatCard label="Epoch s" value={epochInput} copyKey="epoch2" copiedKey={copiedKey} onCopy={copy} />
          </div>
        </div>
      )}

      {/* ── Date Math ──────────────────────────────────────────────────── */}
      <div className="flex flex-col border-t border-border/40">
        <SectionHeader icon={<span className="text-[10px] font-bold leading-none">±</span>} label="Date Math" colorClass="text-primary" />
        <div className="flex items-center gap-2 px-3 pb-3">
          <input
            type="number"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            placeholder="±"
            className="w-20 bg-muted/30 border border-border/60 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none focus:border-primary/40 focus:bg-primary/5 transition-colors"
          />
          <Select value={addUnit} onValueChange={(v) => setAddUnit(v as typeof addUnit)}>
            <SelectTrigger className="flex-1 text-xs h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seconds">Seconds</SelectItem>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="weeks">Weeks</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={handleAdd}
            disabled={!addValue || !date}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 hover:border-primary/50 transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ── Timezones ──────────────────────────────────────────────────── */}
      {date && (
        <div className="flex flex-col border-t border-border/40 pb-2">
          <SectionHeader
            icon={<Globe className="size-2.5" />}
            label="Timezones"
            colorClass="text-warning"
            action={
              <button
                onClick={() => { setAddingTz(true); setTzInput(''); setTzError(''); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-border/50 text-muted-foreground hover:text-warning hover:border-warning/30 hover:bg-warning/5 transition-all"
              >
                <Plus className="size-2.5" />
                Add
              </button>
            }
          />

          {/* Add timezone inline input */}
          {addingTz && (
            <div className="flex flex-col gap-1 px-3 pb-2">
              <div className="flex items-center gap-2">
                <input
                  ref={tzInputRef}
                  list="tz-suggestions"
                  value={tzInput}
                  onChange={(e) => { setTzInput(e.target.value); setTzError(''); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTz();
                    if (e.key === 'Escape') { setAddingTz(false); setTzError(''); }
                  }}
                  onBlur={() => { if (!tzInput) { setAddingTz(false); setTzError(''); } }}
                  placeholder="e.g. Europe/Berlin"
                  className="flex-1 bg-muted/30 border border-border/60 rounded-lg px-2.5 py-1.5 font-mono text-xs outline-none focus:border-warning/40 focus:bg-warning/5 transition-colors"
                />
                <button
                  onClick={handleAddTz}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-warning/15 border border-warning/30 text-warning hover:bg-warning/25 transition-all"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingTz(false); setTzError(''); }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <X className="size-3" />
                </button>
              </div>
              {tzError && <p className="text-[10px] text-destructive pl-1">{tzError}</p>}
              <datalist id="tz-suggestions">
                {TZ_SUGGESTIONS.map((tz) => <option key={tz} value={tz} />)}
              </datalist>
            </div>
          )}

          {/* Rows */}
          <div className="flex flex-col divide-y divide-border/20 px-1">
            {timezones.map((tz) => {
              const { time, offset, label } = formatInZone(date, tz);
              const copyKey = `tz-${tz}`;
              return (
                <div key={tz} className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-medium text-foreground/90 truncate">{label}</span>
                    <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-warning/10 border border-warning/20 text-warning/80">
                      {offset}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">{time}</span>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => copy(time, copyKey)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    >
                      {copiedKey === copyKey ? <Check className="size-2.5 text-success" /> : <Copy className="size-2.5" />}
                    </button>
                    {timezones.length > 1 && (
                      <button
                        onClick={() => handleRemoveTz(tz)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="size-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
