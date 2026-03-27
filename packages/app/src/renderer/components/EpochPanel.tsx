import { useState, useMemo, useCallback, useEffect } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
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

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

function formatInZone(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return '—';
  }
}

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

// ── section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

// ── copyable row ──────────────────────────────────────────────────────────────

function CopyRow({ label, value, copyKey, copiedKey, onCopy }: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (v: string, k: string) => void;
}) {
  return (
    <button
      onClick={() => onCopy(value, copyKey)}
      className="flex items-center justify-between w-full px-3 py-1.5 rounded hover:bg-muted/40 transition-colors text-left group"
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="flex-1 font-mono text-xs text-foreground">{value}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
        {copiedKey === copyKey
          ? <Check className="size-3 text-green-400" />
          : <Copy className="size-3 text-muted-foreground" />}
      </span>
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

  const date = useMemo(() => {
    const n = Number(epochInput);
    if (!isNaN(n) && epochInput.trim() !== '') return epochToDate(n);
    return null;
  }, [epochInput]);

  const handleEpochChange = useCallback((value: string) => {
    setLiveMode(false);
    setEpochInput(value);
    const n = Number(value);
    if (!isNaN(n) && value.trim() !== '') {
      setDateInput(toLocalIso(new Date(n * 1000)));
    }
  }, []);

  const handleDateChange = useCallback((value: string) => {
    setLiveMode(false);
    setDateInput(value);
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      setEpochInput(String(dateToEpoch(d)));
    }
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

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {/* Converter */}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <SectionLabel>Converter</SectionLabel>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={handleNow}
              title="Set to now"
            >
              <RefreshCw className="size-3" />
              Now
            </Button>
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
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors',
                liveMode
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', liveMode ? 'bg-primary animate-pulse' : 'bg-muted-foreground')} />
              Live
            </button>
          </div>
        </div>

        {/* Epoch input */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground">Unix Timestamp (seconds)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={epochInput}
              onChange={(e) => handleEpochChange(e.target.value)}
              className="flex-1 bg-muted/40 border border-border rounded px-3 py-1.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
              placeholder="1700000000"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => copy(epochInput, 'epoch')}
            >
              {copiedKey === 'epoch' ? <Check className="text-green-400" /> : <Copy />}
            </Button>
          </div>
        </div>

        {/* Date/time input */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-muted-foreground">Local Date & Time</label>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={dateInput}
              onChange={(e) => handleDateChange(e.target.value)}
              step="1"
              className="flex-1 bg-muted/40 border border-border rounded px-3 py-1.5 font-mono text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => copy(dateInput, 'datetime')}
            >
              {copiedKey === 'datetime' ? <Check className="text-green-400" /> : <Copy />}
            </Button>
          </div>
        </div>

        {/* Relative */}
        {date && (
          <p className="text-xs text-muted-foreground px-1">
            {humanRelative(date)}
          </p>
        )}
      </div>

      {/* Formats */}
      {date && (
        <div className="flex flex-col py-1 border-b border-border">
          <div className="px-4 py-2">
            <SectionLabel>Formats</SectionLabel>
          </div>
          <CopyRow label="ISO 8601" value={date.toISOString()} copyKey="iso" copiedKey={copiedKey} onCopy={copy} />
          <CopyRow label="UTC" value={date.toUTCString()} copyKey="utc" copiedKey={copiedKey} onCopy={copy} />
          <CopyRow label="Local" value={date.toLocaleString()} copyKey="local" copiedKey={copiedKey} onCopy={copy} />
          <CopyRow label="Epoch (ms)" value={String(date.getTime())} copyKey="ms" copiedKey={copiedKey} onCopy={copy} />
          <CopyRow label="Epoch (s)" value={epochInput} copyKey="epoch2" copiedKey={copiedKey} onCopy={copy} />
        </div>
      )}

      {/* Date math */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
        <SectionLabel>Date Math</SectionLabel>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            placeholder="±"
            className="w-20 bg-muted/40 border border-border rounded px-2 py-1 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
          <select
            value={addUnit}
            onChange={(e) => setAddUnit(e.target.value as typeof addUnit)}
            className="bg-muted/40 border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>
          <Button variant="outline" size="xs" onClick={handleAdd}>
            Apply
          </Button>
        </div>
      </div>

      {/* Timezone table */}
      {date && (
        <div className="flex flex-col border-b border-border">
          <div className="px-4 py-2 border-b border-border">
            <SectionLabel>Timezones</SectionLabel>
          </div>
          <div>
            {TIMEZONES.map((tz) => (
              <CopyRow
                key={tz}
                label={tz.split('/').pop() ?? tz}
                value={formatInZone(date, tz)}
                copyKey={`tz-${tz}`}
                copiedKey={copiedKey}
                onCopy={copy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
