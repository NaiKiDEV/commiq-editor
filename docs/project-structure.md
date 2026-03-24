# Project Structure

## Monorepo Layout

```
commiq-editor/
  docs/                           # Architecture and decision docs
  packages/
    app/                          # Electron application
      src/
        main/                     # Main process (Node.js)
          index.ts                # Entry point, window creation
          preload.ts              # Context bridge (renderer <-> main)
          ipc/                    # IPC handler modules
            terminal.ts           # PTY spawn/write/resize/kill
            browser.ts            # WebContentsView lifecycle
            workspace.ts          # Panel registry & layout persistence
            settings.ts           # App configuration persistence
            env.ts                # Environment variables
            processes.ts          # Process monitoring
            ports.ts              # Port monitoring
            timer.ts              # Timer functionality
            workflow.ts           # Workflow panel management
            notes.ts              # Notes panel management
        renderer/                 # Renderer process (React)
          stores/                 # Commiq stores
            workspace.ts          # Panel/tab/workspace state
            terminal.ts           # Terminal session state (factory — uses withInjector)
            browser.ts            # Browser session state (factory — uses withInjector)
            bus.ts                # Event bus wiring + cross-store coordination
            effects.ts            # Side effects (browser visibility, etc.)
            index.ts              # Store instantiation + exports
          hooks/                  # React hooks (commiq domain hooks)
            use-workspace.ts      # Workspace/tab/panel selectors & actions
            use-terminal.ts       # Terminal session selectors & actions
            use-browser.ts        # Browser session selectors & actions
          components/             # React UI components
            Shell.tsx             # Root layout + keyboard shortcuts
            TitleBar.tsx          # Window title bar
            TabBar.tsx            # Tab strip (drag, rename, context menu)
            PanelContainer.tsx    # Panel rendering + layout slot measurement
            LayoutRenderer.tsx    # Recursive split layout renderer
            ResizeDivider.tsx     # Draggable split divider
            TerminalPanel.tsx     # xterm.js wrapper (data plane)
            BrowserPanel.tsx      # WebContentsView wrapper (data plane)
            NotesPanel.tsx        # Text editor panel
            WorkflowPanel.tsx     # Workflow builder/runner
            TimerPanel.tsx        # Timer panel
            PortMonitorPanel.tsx  # Port monitor panel
            ProcessMonitorPanel.tsx # Process monitor panel
            EnvVarsPanel.tsx      # Environment variables viewer
            StatusBar.tsx         # Bottom status bar
            CommandPalette.tsx    # Command palette (cmdk)
            SettingsModal.tsx     # Settings UI
            ui/                   # shadcn/ui (Base UI) components
          contexts/
            settings.tsx          # Settings context provider
          lib/
            layout.ts             # Layout tree algorithms
            persistence.ts        # Workspace state persistence
          App.tsx                 # Root component (CommiqProvider)
          index.tsx               # Entry point
          electron.d.ts           # TypeScript definitions for IPC
      forge.config.ts             # Electron Forge config
      vite.main.config.ts         # Vite config for main process
      vite.preload.config.ts      # Vite config for preload
      vite.renderer.config.ts     # Vite config for renderer
      package.json
      tsconfig.json
  package.json                    # Workspace root
  pnpm-workspace.yaml
  .gitignore
```

## Package Boundaries

- `packages/app` — The Electron application. Contains main process, preload, and renderer code.
- Future packages (if needed): shared types, panel plugins, theme packages.

## Key Conventions

- Stores are created and sealed in their respective files under `stores/`
- Stores that need IPC use `withInjector` and export factory functions (e.g., `createTerminalStore`)
- Cross-store coordination is wired in `stores/bus.ts` via the event bus
- Side effects triggered by events are handled in `stores/effects.ts` via `@naikidev/commiq-effects`
- Hooks wrap commiq's `useSelector`, `useQueue`, `useEvent` for each store
- Components are pure UI — all domain logic flows through commiq commands and state
- Data plane streams (PTY data, keyboard input) bypass commiq and use direct IPC
- IPC handlers in `main/ipc/` map 1:1 to operations exposed via preload

See [architecture.md](architecture.md) for design rationale and [commiq-patterns.md](commiq-patterns.md) for usage patterns.
