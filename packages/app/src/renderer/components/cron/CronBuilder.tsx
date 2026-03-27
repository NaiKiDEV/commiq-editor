import { cn } from '@/lib/utils';

export type CronFields = {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
};

export function fieldsToExpression(f: CronFields): string {
  return `${f.minute} ${f.hour} ${f.dayOfMonth} ${f.month} ${f.dayOfWeek}`;
}

export function expressionToFields(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

type FieldConfig = {
  key: keyof CronFields;
  label: string;
  presets: { label: string; value: string }[];
};

const FIELDS: FieldConfig[] = [
  {
    key: 'minute',
    label: 'Minute',
    presets: [
      { label: '*', value: '*' },
      { label: '0', value: '0' },
      { label: '*/5', value: '*/5' },
      { label: '*/15', value: '*/15' },
      { label: '*/30', value: '*/30' },
    ],
  },
  {
    key: 'hour',
    label: 'Hour',
    presets: [
      { label: '*', value: '*' },
      { label: '0', value: '0' },
      { label: '9', value: '9' },
      { label: '12', value: '12' },
      { label: '*/6', value: '*/6' },
      { label: '*/12', value: '*/12' },
    ],
  },
  {
    key: 'dayOfMonth',
    label: 'Day',
    presets: [
      { label: '*', value: '*' },
      { label: '1', value: '1' },
      { label: '15', value: '15' },
      { label: '1,15', value: '1,15' },
    ],
  },
  {
    key: 'month',
    label: 'Month',
    presets: [
      { label: '*', value: '*' },
      { label: '1-6', value: '1-6' },
      { label: '7-12', value: '7-12' },
      { label: '*/3', value: '*/3' },
    ],
  },
];

const DAYS_OF_WEEK = [
  { label: 'Sun', value: '0' },
  { label: 'Mon', value: '1' },
  { label: 'Tue', value: '2' },
  { label: 'Wed', value: '3' },
  { label: 'Thu', value: '4' },
  { label: 'Fri', value: '5' },
  { label: 'Sat', value: '6' },
];

function toggleDayOfWeek(current: string, day: string): string {
  if (current === '*') return day;
  const days = current.split(',').filter(Boolean);
  const idx = days.indexOf(day);
  if (idx === -1) {
    const next = [...days, day].sort((a, b) => Number(a) - Number(b));
    return next.join(',');
  }
  const next = days.filter((d) => d !== day);
  return next.length === 0 ? '*' : next.join(',');
}

function isDayActive(current: string, day: string): boolean {
  if (current === '*') return true;
  return current.split(',').includes(day);
}

type CronBuilderProps = {
  fields: CronFields;
  onChange: (fields: CronFields) => void;
};

function FieldEditor({ config, value, onChange }: {
  config: FieldConfig;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {config.label}
      </span>
      <input
        type="text"
        className="w-full bg-muted/40 border border-border rounded px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="flex flex-wrap gap-1">
        {config.presets.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors',
              value === p.value
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CronBuilder({ fields, onChange }: CronBuilderProps) {
  const set = (key: keyof CronFields, value: string) =>
    onChange({ ...fields, [key]: value });

  return (
    <div className="flex flex-col gap-4 px-4 py-3 border-t border-border">
      {/* Minute / Hour / Day / Month */}
      <div className="grid grid-cols-4 gap-3">
        {FIELDS.map((config) => (
          <FieldEditor
            key={config.key}
            config={config}
            value={fields[config.key]}
            onChange={(v) => set(config.key, v)}
          />
        ))}
      </div>

      {/* Day of week */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Day of week
        </span>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => set('dayOfWeek', '*')}
            className={cn(
              'px-2 py-1 rounded text-xs font-mono border transition-colors',
              fields.dayOfWeek === '*'
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
            )}
          >
            Any
          </button>
          {DAYS_OF_WEEK.map((day) => (
            <button
              key={day.value}
              onClick={() => set('dayOfWeek', toggleDayOfWeek(fields.dayOfWeek, day.value))}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                fields.dayOfWeek !== '*' && isDayActive(fields.dayOfWeek, day.value)
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              )}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
