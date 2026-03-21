# Decisions

Record of key technical decisions. Each entry captures what was decided, why, and what alternatives were considered.

---

## 001 — Electron as runtime

**Decision**: Use Electron for the application shell.

**Context**: Need to embed terminal applications (via PTY), browser pages (via webview), and potentially native applications in a cross-platform workbench.

**Alternatives considered**:
- **Tauri** — Lighter (uses system webview, Rust backend), but multi-webview embedding is less mature and Rust adds complexity we want to avoid.
- **Wails** (Go + webview) — Go backend is appealing, but same system webview limitations as Tauri for embedding browser content.
- **Pure terminal** (Go bubbletea / Rust) — Cannot embed browser pages. Only viable if browser embedding is dropped.

**Rationale**: Electron is the only option that provides first-class support for both PTY hosting (node-pty) and webview embedding. VS Code proves this architecture works at scale. The memory overhead is acceptable for a developer workbench.

---

## 002 — React for renderer UI

**Decision**: Use React for the renderer process.

**Alternatives considered**:
- **Vanilla TypeScript** — Full control, no framework overhead. But building complex UI (tabs, splits, context menus) requires significant DOM management boilerplate.
- **Svelte / Solid** — Lighter, but commiq has existing React bindings.

**Rationale**: Commiq already provides React hooks (`useSelector`, `useQueue`, `useEvent`). React's ecosystem provides layout primitives we'll need. In Electron, React's bundle size is irrelevant.

---

## 003 — Commiq for all application state

**Decision**: Use commiq as the sole state management solution. No Redux, Zustand, or local React state for app logic.

**Rationale**: The library's command/event model maps directly to the editor's domain (panel lifecycle, terminal sessions, browser sessions). Multi-store + event bus enables clean separation while maintaining coordination. `withInjector` solves the IPC boundary problem and keeps stores testable.

---

## 004 — Electron Forge + Vite 7 for build tooling

**Decision**: Use Electron Forge 7.x with Vite 7 (via pnpm override) and `@vitejs/plugin-react@4.7`.

**Context**: Forge 7.x template pins Vite 5, but `@tailwindcss/vite` (Tailwind v4) is ESM-only and fails to load under Vite 5's CJS config bundling. Vite 7 is the current stable line and both `@tailwindcss/vite` and `@vitejs/plugin-react@4.7` explicitly support it.

**Implementation**: pnpm override in root `package.json` forces `vite: "^7.3.1"` across all packages, preventing Forge from hoisting its own Vite 5 copy.

**Rationale**: Vite 7 resolves the ESM config loading issue. Forge 7.x has no enforced peer dep on Vite — the override works cleanly. Keeping tooling current for a new project.

---

## 005 — pnpm workspaces for monorepo

**Decision**: Use pnpm workspaces from the start.

**Rationale**: Consistent with commiq's own build setup. Enables future package extraction (shared types, plugins) without restructuring. Better disk usage than npm/yarn for monorepos.

---

## 006 — Docs in repo

**Decision**: Keep architecture and decision documentation in `docs/` within the repository.

**Rationale**: Docs should live with the code so they're always accessible, versioned, and reviewable in PRs. External storage risks being lost or going stale.

---

## 007 — shadcn/ui with Base UI primitives + Tailwind CSS

**Decision**: Use shadcn/ui (Base UI variant) with Tailwind CSS for all UI components.

**Context**: The workbench needs a clean, minimal, professional look. Most UI is chrome — tab bars, context menus, command palette, status bars. Content areas are xterm.js terminals and webviews.

**Alternatives considered**:
- **Custom CSS (no library)** — Total control but massive effort for interaction patterns (keyboard nav, focus management, accessibility).
- **Radix Primitives + custom CSS** — Good primitives but more manual styling work.
- **shadcn/ui (Radix variant)** — Viable, but Base UI is the newer direction shadcn is investing in.
- **Tailwind only** — Fast styling but still building interaction patterns from scratch.

**Rationale**: shadcn/ui provides copy-paste components that live in our repo (not a dependency). Base UI variant chosen over Radix as the forward-looking primitive layer. The default aesthetic matches our target (clean, minimal, professional — think VS Code, Linear, Raycast). Key components needed: tabs, context menu, command palette (cmdk), dropdown, tooltip, dialog. Tailwind handles theming via CSS variables with trivial dark mode support.

**Key API difference from Radix variant**: Base UI uses `render` prop + `nativeButton={false}` for composition instead of Radix's `asChild` pattern.

---

## 008 — WebContentsView for browser embedding

**Decision**: Use Electron's `WebContentsView` API for embedding browser pages. Not `BrowserView` (deprecated) or `<webview>` tag (semi-deprecated).

**Context**: Need to render web pages inline as workbench panels alongside terminal tabs.

**Impact**: Browser panels are main-process overlays, not DOM elements. The renderer reports panel container bounds via IPC, and the main process positions the `WebContentsView` at those coordinates. Updates on tab switch, window resize, and layout changes via `ResizeObserver`.

**Rationale**: `WebContentsView` is the current Electron API. `BrowserView` is deprecated since Electron 30+. `<webview>` tag has security concerns and is discouraged by the Electron team.

---

## 009 — Control plane vs data plane separation

**Decision**: Commiq manages lifecycle and metadata (control plane). High-frequency data streams bypass commiq entirely (data plane).

**Control plane (through commiq)**: Panel lifecycle, terminal session metadata (spawn, kill, resize, title, status), browser session metadata (navigate, title, loading), app-level state (settings, theme).

**Data plane (direct IPC)**: PTY output → xterm.js, keyboard input → PTY, xterm.js buffer content (owned by xterm.js), WebContentsView DOM (owned by Chromium).

**Rationale**: Commiq processes commands sequentially. PTY output can produce thousands of data chunks per second. Routing this through commiq would create a bottleneck. The store tracks *what exists and its status*, not *what's flowing through it*.

---

## 010 — node-pty with electron-rebuild

**Decision**: Use node-pty for PTY management, with `@electron/rebuild` (via Forge) to handle native module compilation against the correct Electron version.

**Rationale**: node-pty is the only viable PTY library for Node.js. It's a native module requiring compilation against the exact Electron headers. Electron Forge handles rebuild automatically, but this remains the most fragile dependency — version mismatches cause crashes.

---

## 011 — Monorepo from day one

**Decision**: Structure as a pnpm workspace monorepo from the start, even with a single package.

**Rationale**: Minimal overhead, consistent with commiq's own setup. Avoids a disruptive restructuring when a second package emerges (shared types, plugins, etc.).

---

## 012 — No hidden panels: layout tree is the single source of truth

**Decision**: Remove the concept of hidden (off-layout) panels. Every panel in `panels[]` is always visible in the layout tree. The layout tree is the single source of truth for what exists.

**Context**: The original architecture maintained a flat `panels[]` list (all open panels) and a separate `layout` tree (visible panels). Panels not in the layout were "hidden" — kept mounted with `display: none` to preserve xterm.js and WebContentsView state. This created a class of bugs:

- **Tab bar showed ghost items**: Hidden panels appeared as tabs but clicking them caused unpredictable layout swaps (`panel:activate` replaced the focused leaf with the hidden panel).
- **`panel:open` kicked panels into hidden state**: Opening a new panel replaced the active leaf; the displaced panel went hidden rather than being closed.
- **Split interactions were broken**: With multiple visible panes, tab clicks and open commands had ambiguous targets (which pane to replace?), causing panels to jump between split positions.
- **Singleton assumptions**: Code assumed one "main" panel with everything else backgrounded. NotesPanel had no `panelId` — multiple instances shared state.
- **Command palette "Switch Tab" rearranged layout**: `activatePanel` on a hidden panel mutated the layout tree rather than just changing focus.

**The new model**:

| Invariant | Description |
|-----------|-------------|
| `panels[]` ↔ `layout` sync | Every panel is a leaf in the layout. Every leaf references a panel. No orphans in either direction. |
| `activePanelId` is focus only | Setting the active panel never mutates the layout. It only tracks which pane has keyboard focus. |
| `panel:open` replaces + closes | Opens a new panel in the active leaf. The previous panel occupying that leaf is **closed** (removed from `panels[]`, sessions cleaned up). No hidden state. |
| `panel:activate` is safe | If the panel is in the layout, focus it. If not, no-op. Never swaps or mutates layout. |
| Close collapses | Closing a panel removes it from `panels[]` and the layout tree. `removePanel()` collapses empty split nodes. Siblings are unaffected (no remount). |

**What this eliminates**:
- Hidden panel mounting (`display: none` divs in PanelContainer)
- Layout-mutating activate (the swap branch in `panel:activate`)
- Ghost tabs (every tab = a visible pane)
- Ambiguous open targets (always replaces the focused leaf, closes the old one)

**Trade-off**: You can no longer background a panel and bring it back. If you want two terminals, you split. Closing a split destroys the panel. This is acceptable because:
1. Terminal state is ephemeral (shell sessions aren't precious).
2. Browser pages can be re-navigated.
3. The UX is predictable — what you see is what you have.

**Files affected**: `workspace.ts` (command handlers), `PanelContainer.tsx` (remove hidden section), `LayoutRenderer.tsx` (pass panelId to NotesPanel), `CommandPalette.tsx` (simplify Switch Tab → Focus Pane), `StatusBar.tsx` (remove total vs visible distinction).
