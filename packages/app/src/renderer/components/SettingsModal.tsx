import { useState, useEffect } from 'react';
import { Settings2, TerminalSquare, Globe, LayoutDashboard } from 'lucide-react';
import { Dialog, DialogContent } from '@/renderer/components/ui/dialog';
import { useSettings } from '@/renderer/contexts/settings';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'whiteboard', label: 'Whiteboard', icon: LayoutDashboard },
] as const;

type TabId = (typeof tabs)[number]['id'];

function GeneralTab() {
  const shortcuts = [
    {
      group: 'Navigation',
      items: [
        { label: 'Next tab', key: 'Ctrl+Tab' },
        { label: 'Previous tab', key: 'Ctrl+Shift+Tab' },
        { label: 'Jump to tab 1–8', key: 'Ctrl+1–8' },
        { label: 'Jump to last tab', key: 'Ctrl+9' },
      ],
    },
    {
      group: 'Tabs',
      items: [
        { label: 'Close tab', key: 'Ctrl+W' },
        { label: 'Open command palette', key: 'Ctrl+N' },
        { label: 'Toggle command palette', key: 'Ctrl+K' },
      ],
    },
    {
      group: 'App',
      items: [
        { label: 'Open settings', key: 'Ctrl+,' },
      ],
    },
  ];

  return (
    <div>
      {shortcuts.map((section) => (
        <div key={section.group} className="mt-6 first:mt-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {section.group}
          </p>
          {section.items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between py-1.5 border-b border-border/40 text-sm"
            >
              <span className="text-foreground">{item.label}</span>
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TerminalTab() {
  const { settings, updateSettings } = useSettings();
  const { terminal } = settings;
  const [availableShells, setAvailableShells] = useState<string[]>([]);

  useEffect(() => {
    window.electronAPI.terminal.getShells().then(setAvailableShells).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Font Family</span>
        <input
          type="text"
          value={terminal.fontFamily}
          onChange={(e) => updateSettings({ terminal: { fontFamily: e.target.value } })}
          className="w-64 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Font Size</span>
        <input
          type="number"
          min={8}
          max={32}
          value={terminal.fontSize}
          onChange={(e) => updateSettings({ terminal: { fontSize: Number(e.target.value) } })}
          className="w-20 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Cursor Style</span>
        <select
          value={terminal.cursorStyle}
          onChange={(e) =>
            updateSettings({
              terminal: { cursorStyle: e.target.value as 'block' | 'underline' | 'bar' },
            })
          }
          className="h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="block">Block</option>
          <option value="underline">Underline</option>
          <option value="bar">Bar</option>
        </select>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Shell</span>
        <select
          value={terminal.shell}
          onChange={(e) => updateSettings({ terminal: { shell: e.target.value } })}
          className="w-64 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">System default</option>
          {availableShells.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Scrollback Lines</span>
        <input
          type="number"
          min={100}
          max={50000}
          value={terminal.scrollback}
          onChange={(e) => updateSettings({ terminal: { scrollback: Number(e.target.value) } })}
          className="w-28 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}

function BrowserTab() {
  const { settings, updateSettings } = useSettings();

  return (
    <div>
      <div className="py-2 border-b border-border/40">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-foreground">Default Homepage</span>
        </div>
        <input
          type="text"
          value={settings.browser.defaultUrl}
          onChange={(e) => updateSettings({ browser: { defaultUrl: e.target.value } })}
          className="w-full h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Opened when creating a new Browser tab
        </p>
      </div>
    </div>
  );
}

function WhiteboardTab() {
  const { settings, updateSettings } = useSettings();

  return (
    <div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">MCP Server Port</span>
        <input
          type="number"
          min={1024}
          max={65535}
          value={settings.whiteboard.mcpPort}
          onChange={(e) => updateSettings({ whiteboard: { mcpPort: Number(e.target.value) } })}
          className="w-28 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Port for the MCP SSE server (default: 3100). Restart the MCP server after changing.
      </p>
    </div>
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex p-0 overflow-hidden w-full sm:max-w-2xl h-[500px]"
      >
        {/* Left sidebar */}
        <div className="w-44 shrink-0 border-r border-border flex flex-col gap-1 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
            Settings
          </p>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors w-full text-left',
                activeTab === tab.id
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right content pane */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'terminal' && <TerminalTab />}
          {activeTab === 'browser' && <BrowserTab />}
          {activeTab === 'whiteboard' && <WhiteboardTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
