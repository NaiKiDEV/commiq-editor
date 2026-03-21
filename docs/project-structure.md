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
          ipc/                    # IPC handler modules
            terminal.ts           # PTY spawn/write/resize/kill
            browser.ts            # BrowserView lifecycle
          preload.ts              # Context bridge (renderer ↔ main)
        renderer/                 # Renderer process (React)
          stores/                 # Commiq stores
            workspace.ts          # Panel/tab state
            terminal.ts           # Terminal session state
            browser.ts            # Browser session state
            bus.ts                # Event bus wiring
          components/             # React components
            Shell.tsx             # Root layout
            TabBar.tsx            # Tab strip
            PanelContainer.tsx    # Renders active panel by type
            TerminalPanel.tsx     # xterm.js wrapper
            BrowserPanel.tsx      # Webview wrapper
          hooks/                  # React hooks (commiq bindings)
            use-workspace.ts
            use-terminal.ts
            use-browser.ts
          App.tsx                 # Root component
          index.tsx               # Entry point
          index.html              # HTML shell
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
- Hooks wrap commiq's `useSelector`, `useQueue`, `useEvent` for each store
- Components are pure UI — all logic flows through commiq commands and state
- IPC handlers in `main/ipc/` map 1:1 to operations exposed via preload
- The event bus is wired in `stores/bus.ts` and connected at app startup
