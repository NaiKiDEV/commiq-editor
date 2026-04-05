import { useState } from 'react';
import { ArrowLeft, ScrollText, Info, TerminalSquare, FolderOpen } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { ContainerLogs } from './ContainerLogs';
import { ContainerInspect } from './ContainerInspect';
import { ContainerExec } from './ContainerExec';
import { ContainerFiles } from './ContainerFiles';
import { StateIndicator } from './ContainerList';
import type { DockerContainer } from './types';

export type ContainerTab = 'logs' | 'inspect' | 'exec' | 'files';

type Props = {
  container: DockerContainer;
  defaultTab?: ContainerTab;
  onBack: () => void;
};

const TABS: { key: ContainerTab; label: string; icon: React.ReactNode }[] = [
  { key: 'logs', label: 'Logs', icon: <ScrollText className="size-3" /> },
  { key: 'inspect', label: 'Inspect', icon: <Info className="size-3" /> },
  { key: 'exec', label: 'Exec', icon: <TerminalSquare className="size-3" /> },
  { key: 'files', label: 'Files', icon: <FolderOpen className="size-3" /> },
];

function stateLabel(state: string): string {
  switch (state) {
    case 'running': return 'Running';
    case 'paused': return 'Paused';
    case 'restarting': return 'Restarting';
    case 'exited': return 'Exited';
    case 'dead': return 'Dead';
    case 'created': return 'Created';
    default: return state;
  }
}

export function ContainerDetail({ container, defaultTab = 'logs', onBack }: Props) {
  const [activeTab, setActiveTab] = useState<ContainerTab>(defaultTab);
  const name = container.Names.replace(/^\//, '');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Button variant="ghost" size="icon-xs" onClick={onBack} title="Back to list">
            <ArrowLeft className="size-3.5" />
          </Button>
          <StateIndicator state={container.State} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold truncate">{name}</span>
              <span className="text-[10px] text-muted-foreground">{stateLabel(container.State)}</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{container.Image}</div>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {container.ID.slice(0, 12)}
          </span>
        </div>

        {/* Tab bar */}
        <div className="flex items-center px-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — keep all tabs mounted so Exec session survives tab switches */}
      <div className="flex-1 min-h-0 relative">
        <div className={cn('absolute inset-0', activeTab === 'logs' ? 'flex flex-col' : 'hidden')}>
          <ContainerLogs container={container} />
        </div>
        <div className={cn('absolute inset-0', activeTab === 'inspect' ? 'flex flex-col' : 'hidden')}>
          <ContainerInspect container={container} />
        </div>
        <div className={cn('absolute inset-0', activeTab === 'exec' ? 'flex flex-col' : 'hidden')}>
          <ContainerExec container={container} />
        </div>
        <div className={cn('absolute inset-0', activeTab === 'files' ? 'flex flex-col' : 'hidden')}>
          <ContainerFiles container={container} />
        </div>
      </div>
    </div>
  );
}
