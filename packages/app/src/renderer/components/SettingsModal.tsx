import { useState, useEffect } from "react";
import {
  Settings2,
  TerminalSquare,
  Globe,
  LayoutDashboard,
  Palette,
} from "lucide-react";
import { Dialog, DialogContent } from "@/renderer/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { useSettings } from "@/renderer/contexts/settings";
import type { Theme } from "@/renderer/contexts/settings";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "whiteboard", label: "Whiteboard", icon: LayoutDashboard },
] as const;

type TabId = (typeof tabs)[number]["id"];

const themes: {
  id: Theme;
  label: string;
  description: string;
  variant: "dark" | "light";
  preview: { bg: string; card: string; border: string };
}[] = [
  {
    id: "amoled",
    label: "AMOLED Black",
    description: "True black, high contrast",
    variant: "dark",
    preview: {
      bg: "bg-[#252525]",
      card: "bg-[#353535]",
      border: "border-white/10",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Softer dark, easier on the eyes",
    variant: "dark",
    preview: {
      bg: "bg-[#313244]",
      card: "bg-[#3a3c52]",
      border: "border-white/12",
    },
  },
  {
    id: "light",
    label: "Light",
    description: "Clean and bright",
    variant: "light",
    preview: {
      bg: "bg-[#f9f9fb]",
      card: "bg-[#ededf2]",
      border: "border-black/11",
    },
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    description: "Warm pastel tones on a dark base",
    variant: "dark",
    preview: {
      bg: "bg-[#1e1e2e]",
      card: "bg-[#313244]",
      border: "border-[#cdd6f4]/12",
    },
  },
  {
    id: "gruvbox-material-dark-hard",
    label: "Gruvbox Material Dark Hard",
    description: "Earthy warm tones on a near-black base",
    variant: "dark",
    preview: {
      bg: "bg-[#1d2021]",
      card: "bg-[#32302f]",
      border: "border-[#d4be98]/12",
    },
  },
  {
    id: "rose-pine-moon",
    label: "Rosé Pine Moon",
    description: "Dusty purple depths with muted rose accents",
    variant: "dark",
    preview: {
      bg: "bg-[#232136]",
      card: "bg-[#2a273f]",
      border: "border-[#e0def4]/12",
    },
  },
  {
    id: "rose-pine",
    label: "Rosé Pine",
    description: "Deep violet-black base with soft rose and iris accents",
    variant: "dark",
    preview: {
      bg: "bg-[#191724]",
      card: "bg-[#1f1d2e]",
      border: "border-[#e0def4]/12",
    },
  },
  {
    id: "kanagawa-wave",
    label: "Kanagawa Wave",
    description: "Deep indigo ink with warm parchment tones",
    variant: "dark",
    preview: {
      bg: "bg-[#1f1f28]",
      card: "bg-[#2a2a37]",
      border: "border-[#dcd7ba]/12",
    },
  },
  {
    id: "kanagawa-dragon",
    label: "Kanagawa Dragon",
    description: "Warm ash-black with muted desaturated accents",
    variant: "dark",
    preview: {
      bg: "bg-[#1d1c19]",
      card: "bg-[#282727]",
      border: "border-[#c5c9c5]/12",
    },
  },
  {
    id: "rose-pine-light",
    label: "Rosé Pine Light",
    description: "Warm parchment base with soft rose and muted iris accents",
    variant: "light",
    preview: {
      bg: "bg-[#faf4ed]",
      card: "bg-[#f2e9e1]",
      border: "border-[#575279]/11",
    },
  },
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    description: "Soft pastel tones on a light cream base",
    variant: "light",
    preview: {
      bg: "bg-[#eff1f5]",
      card: "bg-[#ccd0da]",
      border: "border-[#4c4f69]/11",
    },
  },
  {
    id: "gruvbox-material-light",
    label: "Gruvbox Material Light",
    description: "Warm cream canvas with earthy ink tones",
    variant: "light",
    preview: {
      bg: "bg-[#fbf1c7]",
      card: "bg-[#ebdbb2]",
      border: "border-[#3c3836]/11",
    },
  },
];

function ThemeGrid({ ids, active, onSelect }: {
  ids: typeof themes;
  active: Theme;
  onSelect: (id: Theme) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ids.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(theme.id)}
          className={cn(
            "flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
            active === theme.id
              ? "border-primary bg-muted"
              : "border-border hover:border-muted-foreground/30 hover:bg-muted/50",
          )}
        >
          <div
            className={cn(
              "w-full h-10 rounded-md flex items-center gap-1.5 px-2",
              theme.preview.bg,
              "border",
              theme.preview.border,
            )}
          >
            <div className={cn("w-6 h-5 rounded-sm", theme.preview.card)} />
            <div className={cn("flex-1 h-5 rounded-sm", theme.preview.card)} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{theme.label}</p>
            <p className="text-xs text-muted-foreground">{theme.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function ThemesTab() {
  const { settings, updateSettings } = useSettings();
  const darkThemes = themes.filter((t) => t.variant === "dark");
  const lightThemes = themes.filter((t) => t.variant === "light");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Dark
        </p>
        <ThemeGrid ids={darkThemes} active={settings.theme} onSelect={(id) => updateSettings({ theme: id })} />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Light
        </p>
        <ThemeGrid ids={lightThemes} active={settings.theme} onSelect={(id) => updateSettings({ theme: id })} />
      </div>
    </div>
  );
}

function GeneralTab() {
  const shortcuts = [
    {
      group: "Navigation",
      items: [
        { label: "Next tab", key: "Ctrl+Tab" },
        { label: "Previous tab", key: "Ctrl+Shift+Tab" },
        { label: "Jump to tab 1–8", key: "Ctrl+1–8" },
        { label: "Jump to last tab", key: "Ctrl+9" },
      ],
    },
    {
      group: "Tabs",
      items: [
        { label: "Close tab", key: "Ctrl+W" },
        { label: "Open command palette", key: "Ctrl+N" },
        { label: "Toggle command palette", key: "Ctrl+K" },
      ],
    },
    {
      group: "App",
      items: [{ label: "Open settings", key: "Ctrl+," }],
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
    window.electronAPI.terminal
      .getShells()
      .then(setAvailableShells)
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Font Family</span>
        <input
          type="text"
          value={terminal.fontFamily}
          onChange={(e) =>
            updateSettings({ terminal: { fontFamily: e.target.value } })
          }
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
          onChange={(e) =>
            updateSettings({ terminal: { fontSize: Number(e.target.value) } })
          }
          className="w-20 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Cursor Style</span>
        <Select
          value={terminal.cursorStyle}
          onValueChange={(v) =>
            updateSettings({
              terminal: { cursorStyle: v as "block" | "underline" | "bar" },
            })
          }
        >
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="block">Block</SelectItem>
            <SelectItem value="underline">Underline</SelectItem>
            <SelectItem value="bar">Bar</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Shell</span>
        <Select
          value={terminal.shell || "__default__"}
          onValueChange={(v) =>
            updateSettings({
              terminal: { shell: v === "__default__" ? "" : v },
            })
          }
        >
          <SelectTrigger className="h-7 text-xs w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">System default</SelectItem>
            {availableShells.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between py-2 border-b border-border/40">
        <span className="text-sm text-foreground">Scrollback Lines</span>
        <input
          type="number"
          min={100}
          max={50000}
          value={terminal.scrollback}
          onChange={(e) =>
            updateSettings({ terminal: { scrollback: Number(e.target.value) } })
          }
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
          onChange={(e) =>
            updateSettings({ browser: { defaultUrl: e.target.value } })
          }
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
          onChange={(e) =>
            updateSettings({ whiteboard: { mcpPort: Number(e.target.value) } })
          }
          className="w-28 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Port for the MCP Stream/SSE-based server (default: 3100). Restart the
        MCP server after changing.
      </p>
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
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
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors w-full text-left",
                activeTab === tab.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right content pane */}
        <div className="flex-1 overflow-y-auto pr-4 py-4">
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "themes" && <ThemesTab />}
          {activeTab === "terminal" && <TerminalTab />}
          {activeTab === "browser" && <BrowserTab />}
          {activeTab === "whiteboard" && <WhiteboardTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
