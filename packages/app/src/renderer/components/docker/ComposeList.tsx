import { useState } from 'react';
import { RefreshCw, Play, Square, RotateCcw, Loader2, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import type { ComposeProject } from './types';

type ComposeListProps = {
  projects: ComposeProject[];
  loading: boolean;
  onRefresh: () => void;
};

type PendingAction = { name: string; action: 'up' | 'down' | 'restart' } | null;

function parseStatus(status: string): { label: string; color: string } {
  const lower = status.toLowerCase();
  if (lower.includes('running')) {
    const match = status.match(/running\((\d+)\)/i);
    return {
      label: match ? `Running (${match[1]})` : 'Running',
      color: 'text-green-400',
    };
  }
  if (lower.includes('exited')) return { label: 'Exited', color: 'text-muted-foreground' };
  if (lower.includes('restarting')) return { label: 'Restarting', color: 'text-blue-400' };
  return { label: status, color: 'text-muted-foreground' };
}

export function ComposeList({ projects, loading, onRefresh }: ComposeListProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const doAction = async (
    project: ComposeProject,
    action: 'up' | 'down' | 'restart',
  ) => {
    setPendingAction({ name: project.Name, action });
    const configFile = project.ConfigFiles.split(',')[0].trim();
    try {
      if (action === 'up') {
        await window.electronAPI.docker.composeUp(project.Name, configFile);
      } else if (action === 'down') {
        await window.electronAPI.docker.composeDown(project.Name, configFile);
      } else {
        await window.electronAPI.docker.composeRestart(project.Name, configFile);
      }
    } finally {
      setPendingAction(null);
      onRefresh();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Docker Compose
        </span>
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
          ({projects.length})
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {loading && projects.length === 0 && (
          <div className="flex items-center justify-center h-32 gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading...
          </div>
        )}
        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-muted-foreground">
            <p>No Docker Compose projects found</p>
            <p className="text-muted-foreground/60">
              Run <code className="font-mono bg-muted px-1 rounded">docker compose up</code> to start a project
            </p>
          </div>
        )}
        {projects.map((project) => {
          const { label, color } = parseStatus(project.Status);
          const isPending =
            pendingAction?.name === project.Name;
          const configFiles = project.ConfigFiles.split(',').map((f) => f.trim());

          return (
            <div
              key={project.Name}
              className="border border-border/60 rounded-md p-3 bg-card/30 hover:bg-card/60 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">{project.Name}</span>
                    <span className={cn('text-[10px] font-medium', color)}>{label}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {configFiles.map((f) => (
                      <div key={f} className="flex items-center gap-1.5">
                        <FileText className="size-2.5 text-muted-foreground/60 shrink-0" />
                        <span
                          className="text-[10px] text-muted-foreground font-mono truncate"
                          title={f}
                        >
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isPending ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      {pendingAction?.action}...
                    </div>
                  ) : (
                    <>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Up (start)"
                        onClick={() => doAction(project, 'up')}
                      >
                        <Play className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Restart"
                        onClick={() => doAction(project, 'restart')}
                      >
                        <RotateCcw className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Down (stop)"
                        onClick={() => doAction(project, 'down')}
                      >
                        <Square className="size-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
