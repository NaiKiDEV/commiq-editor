import {
  usePanels,
  useActivePanelId,
  useWorkspaceActions,
} from '../hooks/use-workspace';

type TabBarProps = {
  onNewTerminal: () => void;
  onNewBrowser: () => void;
  onClosePanel: (id: string, type: string) => void;
};

export function TabBar({ onNewTerminal, onNewBrowser, onClosePanel }: TabBarProps) {
  const panels = usePanels();
  const activePanelId = useActivePanelId();
  const { activatePanel } = useWorkspaceActions();

  return (
    <div className="flex items-center h-9 bg-neutral-900 border-b border-neutral-800 select-none shrink-0">
      <div className="flex items-center overflow-x-auto flex-1 min-w-0">
        {panels.map((panel) => (
          <button
            key={panel.id}
            className={`group flex items-center gap-1.5 px-3 h-9 text-xs border-r border-neutral-800 whitespace-nowrap transition-colors ${
              panel.id === activePanelId
                ? 'bg-neutral-950 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`}
            onClick={() => activatePanel(panel.id)}
          >
            <span className="text-[10px]">
              {panel.type === 'terminal' ? '>' : '◉'}
            </span>
            <span>{panel.title}</span>
            <span
              className="ml-1 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-300"
              onClick={(e) => {
                e.stopPropagation();
                onClosePanel(panel.id, panel.type);
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0.5 px-2 shrink-0">
        <button
          className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          onClick={onNewTerminal}
        >
          + Terminal
        </button>
        <button
          className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          onClick={onNewBrowser}
        >
          + Browser
        </button>
      </div>
    </div>
  );
}
