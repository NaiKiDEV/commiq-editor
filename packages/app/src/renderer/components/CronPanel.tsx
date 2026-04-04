import { useState, useMemo, useCallback } from 'react';
import cronstrue from 'cronstrue';
import { Copy, Check } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { CronBuilder, fieldsToExpression, expressionToFields, type CronFields } from './cron/CronBuilder';
import { CronNextRuns } from './cron/CronNextRuns';

const DEFAULT_EXPRESSION = '0 9 * * 1';

function parseDescription(expression: string): string | null {
  try {
    return cronstrue.toString(expression, { throwExceptionOnParseError: true });
  } catch {
    return null;
  }
}

export function CronPanel({ panelId: _panelId }: { panelId: string }) {
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [copied, setCopied] = useState(false);

  const fields = useMemo(() => expressionToFields(expression), [expression]);
  const description = useMemo(() => parseDescription(expression), [expression]);
  const isValid = description !== null;

  const handleExpressionChange = useCallback((value: string) => {
    setExpression(value);
  }, []);

  const handleFieldsChange = useCallback((newFields: CronFields) => {
    setExpression(fieldsToExpression(newFields));
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(expression);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [expression]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground text-sm overflow-y-auto">
      {/* Expression bar */}
      <div className="flex flex-col gap-1.5 px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex-1 flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors',
            isValid ? 'border-border' : 'border-destructive/50',
          )}>
            <span className="text-muted-foreground/50 font-mono text-xs shrink-0">cron</span>
            <input
              type="text"
              className="flex-1 bg-transparent font-mono text-sm outline-none text-foreground placeholder:text-muted-foreground/40"
              value={expression}
              onChange={(e) => handleExpressionChange(e.target.value)}
              spellCheck={false}
              placeholder="* * * * *"
            />
          </div>
          <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy expression">
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>

        {/* Human-readable */}
        <p className={cn(
          'text-sm px-1 min-h-5 transition-colors',
          isValid ? 'text-muted-foreground' : 'text-destructive text-xs',
        )}>
          {isValid ? description : 'Invalid cron expression'}
        </p>
      </div>

      {/* Visual builder */}
      {fields && (
        <CronBuilder fields={fields} onChange={handleFieldsChange} />
      )}

      {/* Next runs */}
      {isValid && <CronNextRuns expression={expression} />}
    </div>
  );
}
