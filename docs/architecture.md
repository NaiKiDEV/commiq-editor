# Architecture

## Overview

Commiq Editor is a cross-platform workbench that embeds multiple tool types (terminals, browsers, applications) in a unified tabbed interface. It wraps existing tools rather than reimplementing them.

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Electron | Cross-platform, mature webview + PTY embedding |
| Language | TypeScript | Full stack, matches commiq library |
| UI Framework | React | Commiq has React bindings, ecosystem for complex UIs |
| UI Components | shadcn/ui (Base UI) + Tailwind CSS | Copy-paste components, clean minimal aesthetic, Base UI primitives |
| State Management | [commiq](https://github.com/NaiKiDEV/commiq) v1.1.0 | Event-driven DDD state — owns all app state |
| Build | Electron Forge + Vite | Official recommendation, fast HMR |
| Package Manager | pnpm workspaces | Monorepo support |
| Terminal | node-pty + xterm.js | Battle-tested (used by VS Code, Hyper, Tabby) |
| Browser Embedding | Electron WebContentsView | Current API, replaces deprecated BrowserView |

## Process Model

Electron provides three process types:

- **Main process** — Window management, PTY lifecycle (node-pty), WebContentsView management, IPC routing
- **Renderer process** — React UI, commiq stores, xterm.js rendering, tab/layout management
- **Preload scripts** — Secure bridge between main ↔ renderer (context isolation enabled)

## Data Flow: Control Plane vs Data Plane

Commiq owns the **control plane** (lifecycle, metadata, coordination). High-frequency data streams bypass commiq entirely.

### Control Plane (through commiq)

Low-frequency state changes routed through commiq commands and events:

- Panel lifecycle: open, close, activate, move
- Terminal metadata: spawn, kill, resize, title changes, exit status
- Browser metadata: navigate, title changes, loading state
- App-level: settings, theme, keybindings

### Data Plane (direct IPC)

High-frequency streams that flow directly between components:

- **PTY output** → xterm.js: Binary data stream via dedicated IPC channel
- **Keyboard input** → PTY: Keystroke data via dedicated IPC channel
- **xterm.js buffer content**: Owned by xterm.js internally
- **WebContentsView DOM state**: Owned by Chromium internally

```
┌─ Renderer ─────────────────────────────────┐
│                                             │
│  commiq stores ◄──── low freq ────► IPC     │──── control plane ────► Main Process
│                                             │
│  xterm.js ◄──────── high freq ────► IPC     │──── data plane ───────► node-pty
│                                             │
└─────────────────────────────────────────────┘
```

## Store Architecture

Multi-store design connected via commiq's event bus.

### Workspace Store

Owns panel registry and layout state.

```typescript
type WorkspaceState = {
  panels: Panel[]
  activePanelId: string | null
  layout: LayoutConfig
}
```

- Commands: `panel:open`, `panel:close`, `panel:activate`, `panel:move`
- Events: `PanelOpened`, `PanelClosed`, `PanelActivated`

### Terminal Store

Manages PTY session metadata. Does NOT handle data streams.

```typescript
type TerminalState = {
  sessions: Record<string, TerminalSession>
}

type TerminalSession = {
  id: string
  panelId: string
  pid: number
  title: string
  cwd: string
  status: 'running' | 'exited'
}
```

- Commands: `terminal:spawn`, `terminal:resize`, `terminal:kill`
- Events: `TerminalSpawned`, `TerminalExited`, `TerminalTitleChanged`

### Browser Store

Manages WebContentsView session metadata.

```typescript
type BrowserState = {
  sessions: Record<string, BrowserSession>
}

type BrowserSession = {
  id: string
  panelId: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}
```

- Commands: `browser:open`, `browser:navigate`, `browser:back`, `browser:forward`
- Events: `BrowserNavigated`, `BrowserTitleChanged`, `BrowserLoaded`

### Event Bus Coordination

Stores communicate through commiq's event bus without direct coupling:

- `terminal:spawn` → workspace opens a terminal panel
- `panel:close` → terminal store kills the associated PTY
- `browser:open` → workspace opens a browser panel

## IPC Design

```
Renderer  ──(invoke)──▶  Main Process
                            ├── spawn/resize/kill PTY (control)
                            ├── create/destroy/position WebContentsView (control)
                            └── system operations
          ◀──(events)──  Main Process
                            ├── terminal metadata (title, exit)
                            ├── browser metadata (navigation, title, loading)
                            └── lifecycle events

          ◄── dedicated channels ──►
                            ├── PTY data stream (binary, high frequency)
                            └── terminal input (keystrokes, high frequency)
```

Commiq's `withInjector` extension bridges the IPC boundary for control plane operations:

```typescript
const terminalStore = createTerminalStore({
  ipc: window.electronAPI  // injected via preload
})
```

This keeps stores testable — inject mocks in tests, real IPC in production.

## Side Effects

Commiq's effects plugin handles subscriptions and async coordination:

```typescript
effects.on(TerminalSpawned, (data, ctx) => {
  // Set up direct IPC data channel (bypasses commiq)
  window.electronAPI.onTerminalData(data.sessionId, (output) => {
    // Forward PTY output directly to xterm.js instance
    xtermInstances.get(data.sessionId)?.write(output)
  })
})
```

## WebContentsView Positioning

Browser panels use `WebContentsView` — an overlay managed by the main process, not a DOM element. Coordination required:

1. Renderer measures panel container bounds via `ResizeObserver`
2. Renderer sends bounds `{ x, y, width, height }` to main via IPC
3. Main positions the `WebContentsView` at those coordinates
4. Updates triggered on: tab switch, window resize, layout change

When a browser panel is backgrounded, its `WebContentsView` is hidden (moved off-screen or set to size 0). When activated, it's repositioned to the panel container bounds.

## Panel Abstraction

Every tab is a panel with a type. This makes the layout system agnostic to content:

```typescript
type Panel = {
  id: string
  type: 'terminal' | 'browser' | 'app'
  title: string
  state: 'active' | 'backgrounded'
}
```

New panel types can be added without changing the layout system.

## Layout Strategy

- **Phase 1**: Simple tab bar — one active panel at a time
- **Phase 2**: Split panes — horizontal/vertical splits
- **Phase 3**: Tiling — drag-and-drop panel arrangement
