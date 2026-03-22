# Current Implementation Status

**Last Updated:** 2026-03-22
**Scope:** Tab Management, Splits, Panels, Layout System

---

## Overview

The Commiq Editor is fully functional with:
- ✅ **Tab Management** — Create, switch, rename, reorder, close tabs with keyboard shortcuts
- ✅ **Split Panes** — Horizontal/vertical splits with draggable resize dividers
- ✅ **Panel Types** — Terminal, Browser, Notes, Workflow, App
- ✅ **Multi-panel Layout** — Full layout tree with binary split nodes
- ✅ **Tab Bar UI** — Tab strip with drag-to-reorder, inline rename, context menu

---

## Architecture Overview

### Core Data Model

**EditorState**
```
EditorState
  ├── workspaces: Workspace[]
  └── activeWorkspaceId: string

Workspace
  ├── id: string
  ├── name: string
  ├── tabs: Tab[]
  └── activeTabId: string

Tab (per workspace)
  ├── id: string
  ├── name: string
  ├── panels: Panel[]
  ├── activePanelId: string | null
  ├── layout: LayoutNode | null
  └── transient?: boolean

Panel
  ├── id: string
  ├── type: 'terminal' | 'browser' | 'notes' | 'workflow' | 'app'
  └── title: string
```

**Layout Tree** (`LayoutNode`)
```
LayoutNode = LeafNode | SplitNode

LeafNode
  ├── type: 'leaf'
  └── panelId: string

SplitNode
  ├── type: 'split'
  ├── id: string
  ├── direction: 'horizontal' | 'vertical'
  ├── children: [LayoutNode, LayoutNode]
  └── ratio: number (0.1–0.9)
```

### Key Principle: No Hidden Panels

Every panel in `tabs[].panels[]` is always visible in the layout tree. There is no "backgrounded" state. This eliminates ghost tabs and ambiguous activation.

- **Invariant**: `panels[]` ↔ `layout` must stay in sync (no orphans)
- **`activePanelId`**: Tracks focus only, never mutates layout
- **`panel:open`**: Replaces the active leaf, closes the old panel (no hidden state)
- **`panel:activate`**: If the panel is in the layout, focus it; otherwise no-op
- **Close collapses**: Removing a panel collapses empty split nodes

---

## Implemented Features

### 1. Tab Management (100%)

#### Keyboard Shortcuts (Shell.tsx + browser.ts IPC)
- `Ctrl+Tab` — Next tab (wraps)
- `Ctrl+Shift+Tab` — Previous tab (wraps)
- `Ctrl+1-8` — Jump to tab by position
- `Ctrl+9` — Jump to last tab
- `Ctrl+W` — Close active tab (no-op if only 1 tab)
- `Ctrl+N` — Open command palette with search pre-filtered to "New" commands
- Shortcuts also forwarded from embedded browser views

**Suppression**: During inline rename, shortcuts are suppressed via `isRenamingTabRef.current` to avoid interference.

#### Tab Bar UI (TabBar.tsx)
- **Drag-to-reorder**: Click and drag tabs horizontally; visual feedback with transform + opacity
- **Inline rename**: Double-click tab name → input field; Enter commits, Escape cancels
- **Right-click context menu**: Rename, Close, Close Others, Close to Right
- **Visual states**: Active tab highlighted, inactive tabs show a subtle ring when unfocused

#### Tab Operations (workspace.ts commands)
- `tab:create` — Create new tab with optional transient flag
- `tab:close` — Close tab, emit TabClosed event
- `tab:activate` — Switch to tab (affects active layout)
- `tab:rename` — Rename tab
- `tab:reorder` — Move tab to new position
- `tab:closeOthers` — Keep only specified tab
- `tab:closeToRight` — Close all tabs to the right

#### Tab Persistence (persistence.ts)
- Transient tabs (spawned from workflows) are skipped when persisting
- Non-transient tabs are saved with their full layout state

---

### 2. Split Panes & Layout System (100%)

#### Layout Tree Operations (lib/layout.ts)
- **`getVisiblePanelIds(node)`** — Collect all leaf panelIds
- **`containsPanel(node, panelId)`** — Check if panelId exists anywhere
- **`replaceLeafPanel(node, oldId, newId)`** — Replace panel in a leaf
- **`removePanel(node, panelId)`** — Remove panel and collapse empty splits
- **`splitLeaf(node, panelId, direction, newPanelId, splitId)`** — Split a leaf in given direction
- **`updateSplitRatio(node, splitId, ratio)`** — Adjust split divider (clamped 0.1–0.9)
- **`getFirstLeafPanelId(node)`** — Get first leaf for fallback focus

#### Layout Rendering (LayoutRenderer.tsx + PanelContainer.tsx)
- **Recursive tree rendering** — Splits render flexbox containers; leaves render slot divs
- **Slot measurement** — ResizeObserver measures leaf slots and reports bounds
- **Panel positioning** — Panels rendered absolutely within measured bounds
- **Focus ring** — Unfocused panels get a subtle ring; click to focus

#### Split Divider (ResizeDivider.tsx)
- **Drag-to-resize**: Pointer capture on divider; reports ratio during drag
- **Visual feedback**: Divider color changes on hover; cursor changes to col-resize/row-resize
- **Ratio clamping**: Prevents panels smaller than 10%

#### Split Commands (workspace.ts)
- `layout:split` — Create split with new panel (50/50 ratio)
- `layout:resize` — Update split ratio (via ResizeDivider drag)

---

### 3. Panel Types & Lifecycle (100%)

#### Rendered Panel Types (PanelContainer.tsx)
1. **Terminal** — xterm.js via TerminalPanel.tsx
2. **Browser** — WebContentsView via BrowserPanel.tsx (positioned via IPC)
3. **Notes** — React text editor via NotesPanel.tsx
4. **Workflow** — Command builder/runner via WorkflowPanel.tsx
5. **App** — Placeholder for future app-type panels

#### Panel Lifecycle
- `panel:open` — Creates a new panel, replaces active leaf, closes old panel
- `panel:close` — Removes from layout and `panels[]`, emits PanelClosed
- `panel:activate` — Sets `activePanelId` (focus only), emits PanelActivated
- `panel:updateTitle` — Updates `panel.title` (displayed in status bar)

#### Browser Panel Visibility Coordination
When tabs switch, layouts change, or menus open:
- `browser.hideAll()` hides all WebContentsView overlays
- `browser.showSession(panelId)` repositions and shows specific panels
- Bounds updated by PanelContainer via ResizeObserver

---

### 4. Command Palette & New Panel Creation (100%)

#### Command Types
- "New Terminal" → `terminal:spawn` → `panel:open`
- "New Browser" → `browser:open` → `panel:open`
- "New Notes" → `panel:open` with notes type
- "New Workflow" → `panel:open` with workflow type
- "New [direction] Split" → `layout:split` (left-to-right or top-to-bottom)

#### CommandPalette.tsx Features
- `initialSearch` prop — Pre-filters commands when opened with Ctrl+N
- `forwardRef` with `openWithSearch(search: string)` handle
- Browser visibility hidden while palette is open

---

### 5. Workflow Panel (100%)

#### Workflow Data Model
```typescript
type WorkflowCommand = {
  id: string;
  name: string;        // optional label
  command: string;     // shell command
};

type Workflow = {
  id: string;
  name: string;
  scope: 'workspace' | 'global';
  commands: WorkflowCommand[];
};
```

#### Workflow Storage
- Global workflows: `userData/workflows/global/{id}.json`
- Workspace workflows: `userData/workflows/{workspaceId}/{id}.json`

#### Workflow UI (WorkflowPanel.tsx)
- Left sidebar: List of workflows grouped by scope (Global / Workspace), "+" button to create
- Right editor: Name input, scope toggle, command list with remove buttons, "Run" button

#### Workflow Execution
- "Run" button creates terminal tabs for each command (transient)
- Tab name = `command.name` if set, else workflow name + index
- Command sent to terminal via `terminal:write` with newline

#### Workflow IPC (main/ipc/workflow.ts)
- `workflow:list` → Get all workflows (global + workspace-scoped)
- `workflow:save` → Create/update workflow
- `workflow:delete` → Remove workflow

---

## Not Yet Implemented

### Drag-and-Drop Between Splits
Currently, panels can only be moved by:
- Closing the source panel and opening a new one elsewhere
- Using the command palette to switch which panel is in a slot

**Not implemented**: Dragging a panel from one split to another. This would require:
- Detecting drag start on an active panel
- Showing a drag preview
- Detecting drop target (another leaf slot)
- Running `layout:split` or `replaceLeafPanel` based on target

### Context Menu for Splits
No UI to:
- Delete a specific split (must close all panels in it)
- Swap left/right or up/down children
- Balance split ratios

### Workspace Persistence
Workspaces exist in state but are not persisted across app restarts. Only tabs (within a default workspace) are saved.

### Multi-Workspace Rendering
All three built-in tabs (Home, Settings, Terminal) are hard-coded. Workspace switching works but the UI doesn't reflect multiple workspaces.

---

## UI Components & Styling

All components use **shadcn/ui (Base UI) + Tailwind CSS**:
- Tab bar with subtle animations
- Context menu with hover states
- Resize dividers with visual feedback
- Status bar with panel info
- Command palette with cmdk integration

**Theme**: Dark mode by default via CSS variables (can be toggled).

---

## Files & Structure

### Core Store
- `src/renderer/stores/workspace.ts` — All state, commands, events

### Layout & Rendering
- `src/renderer/lib/layout.ts` — Tree algorithms
- `src/renderer/components/LayoutRenderer.tsx` — Recursive renderer
- `src/renderer/components/PanelContainer.tsx` — Bounds measurement + panel rendering
- `src/renderer/components/ResizeDivider.tsx` — Draggable split divider

### Tab Management
- `src/renderer/components/Shell.tsx` — Keyboard shortcuts, CommandPalette ref
- `src/renderer/components/TabBar.tsx` — Tab strip, drag-to-reorder, rename, context menu

### Panels
- `src/renderer/components/TerminalPanel.tsx` — xterm.js
- `src/renderer/components/BrowserPanel.tsx` — WebContentsView wrapper
- `src/renderer/components/NotesPanel.tsx` — Text editor
- `src/renderer/components/WorkflowPanel.tsx` — Workflow UI

### Other
- `src/renderer/components/CommandPalette.tsx` — Command palette
- `src/renderer/components/StatusBar.tsx` — Shows active panel info
- `src/renderer/components/TitleBar.tsx` — Window controls
- `src/renderer/lib/persistence.ts` — Save/load via IPC

---

## Known Limitations & TODOs

1. **No drag-and-drop between splits** — Would need visual drag preview + drop target detection
2. **No split context menu** — Can't delete/swap splits via UI
3. **No workspace persistence** — Only default workspace used
4. **No workspace switcher UI** — Workspaces exist but aren't visible
5. **No keyboard shortcuts for splits** — Can't create splits via Ctrl+key
6. **No undo/redo** — Every action is immediate
7. **Panel pinning/sticky** — No way to lock a panel open when switching tabs
8. **No panel search/filter** — Can't quickly jump to a specific panel

---

## Next Steps for Improvements

Based on current state:

1. **Drag-and-drop panels** between splits (moderate complexity)
2. **Keyboard shortcuts for splits** (low complexity)
3. **Split context menu** (low complexity)
4. **Workspace persistence & switcher** (moderate complexity)
5. **Undo/redo** (high complexity)
6. **Panel pinning** (moderate complexity)

