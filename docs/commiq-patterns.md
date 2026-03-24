# Commiq Patterns for Commiq Editor

Reference guide for using commiq in this project. Follow these patterns when building new features. See the [commiq docs](https://naikidev.github.io/commiq/docs/) for full library documentation.

## Store Architecture

### Three layers of coordination

| Layer | File | Mechanism | Use case |
|-------|------|-----------|----------|
| **Stores** | `stores/*.ts` | Commands, events, state | Domain logic for a single bounded context |
| **Event bus** | `stores/bus.ts` | `eventBus.on()` | Cross-store command routing (Store A event -> Store B command) |
| **Effects** | `stores/effects.ts` | `createEffects()` | Side effects that aren't store commands (IPC calls, DOM manipulation) |

### Where does this logic go?

| Logic | Location | Why |
|-------|----------|-----|
| State change in response to a command | Store command handler | Core domain logic |
| Store A event should trigger Store B command | `bus.ts` via `eventBus.on()` | Cross-store coordination, decoupled |
| Event should trigger non-store side effect (IPC, DOM, analytics) | `effects.ts` via `effects.on()` | Side effects independent of UI lifecycle |
| Show a toast or navigate on event | Component via `useEvent()` | UI concern, tied to component lifecycle |
| High-frequency data stream (PTY output, keyboard input) | Component `useEffect` + direct IPC | Data plane bypasses commiq (performance) |

### Control plane vs data plane

- **Control plane** (through commiq): Panel lifecycle, session metadata, settings, layout changes. Low-frequency. Goes through commands and events.
- **Data plane** (direct IPC): PTY output -> xterm.js, keyboard input -> PTY. High-frequency. Bypasses commiq entirely.

## Creating a New Store

### Simple store (no external deps)

```ts
import { createStore, sealStore, createCommand, createEvent } from '@naikidev/commiq';
import { withPatch } from '@naikidev/commiq-context';

// ── Types ──
type MyState = { /* ... */ };

// ── Events ──
export const MyStoreEvent = {
  ThingHappened: createEvent<{ id: string }>('mystore:thing-happened'),
};

// ── Store ──
const _store = createStore<MyState>(initialState)
  .useExtension(withPatch<MyState>())
  .addCommandHandler('mystore:do-thing', (ctx, cmd) => {
    ctx.patch({ /* ... */ });
    ctx.emit(MyStoreEvent.ThingHappened, { id: cmd.data.id });
  });

export const myStore = sealStore(_store);

// ── Command factories ──
export const MyStoreCommand = {
  doThing: (id: string) => createCommand('mystore:do-thing', { id }),
};
```

### Store with IPC dependencies (factory pattern)

```ts
import { createStore, sealStore, createCommand, createEvent } from '@naikidev/commiq';
import { withPatch, withInjector } from '@naikidev/commiq-context';

type MyDeps = {
  ipc: {
    create: (id: string) => Promise<void>;
    destroy: (id: string) => Promise<void>;
  };
};

export function createMyStore(deps: MyDeps) {
  const _store = createStore<MyState>(initialState)
    .useExtension(withPatch<MyState>())
    .useExtension(withInjector<MyState>()(deps))
    .addCommandHandler('mystore:create', async (ctx, cmd) => {
      await ctx.deps.ipc.create(cmd.data.id);
      ctx.patch({ /* ... */ });
    });

  return sealStore(_store);
}
```

Instantiate in `stores/index.ts`:
```ts
export const myStore = createMyStore({ ipc: window.electronAPI.myFeature });
```

## Creating Hooks (Domain Hooks)

Wrap commiq's `useSelector` and `useQueue` in domain-specific hooks. Components should never import stores directly.

```ts
import { useSelector, useQueue } from '@naikidev/commiq-react';
import { myStore, MyStoreCommand } from '../stores/my-store';

export function useMyStoreState() {
  return useSelector(myStore, (s) => s.someField);
}

export function useMyStoreActions() {
  const queue = useQueue(myStore);
  return {
    doThing: (id: string) => queue(MyStoreCommand.doThing(id)),
  };
}
```

## Adding Cross-Store Coordination

When a new store's events should trigger commands on another store, add the wiring in `stores/bus.ts`:

```ts
// In bus.ts — add inside initBus()
eventBus.connect(myStore);

eventBus.on(MyStoreEvent.ThingHappened, (event) => {
  otherStore.queue(OtherCommand.react(event.data.id));
});
```

## Adding Side Effects

When a store event should trigger non-command work (IPC calls, browser manipulation, external APIs), add it in `stores/effects.ts`:

```ts
// In effects.ts — add inside initEffects()
const myEffects = createEffects(myStore);

myEffects.on(MyStoreEvent.Created, (data) => {
  window.electronAPI.someService.notify(data.id);
});
```

## Naming Conventions

| Item | Pattern | Example |
|------|---------|---------|
| Command names | `domain:action` | `'terminal:spawn'`, `'browser:navigate'` |
| Event definitions | `DomainEvent.ActionPastTense` | `TerminalSpawned`, `BrowserCreated` |
| Command factories (legacy) | `domainAction(args)` | `spawnTerminal(id, panelId)` |
| Command factories (preferred) | `DomainCommand.action(args)` | `TerminalCommand.spawn(id, panelId)` |
| Store files | `stores/domain.ts` | `stores/terminal.ts` |
| Hook files | `hooks/use-domain.ts` | `hooks/use-terminal.ts` |

**For new code**, prefer the grouped pattern from commiq docs:
```ts
export const TerminalEvent = {
  Spawned: createEvent<TerminalSession>('terminal:spawned'),
  Exited: createEvent<{ id: string; exitCode: number }>('terminal:exited'),
};

export const TerminalCommand = {
  spawn: (sessionId: string, panelId: string) => createCommand('terminal:spawn', { sessionId, panelId }),
  kill: (id: string) => createCommand('terminal:kill', { id }),
};
```

Existing stores use flat exports (`PanelOpened`, `openPanel`). Both styles work — be consistent within a file.

## Panel Type Checklist

When adding a new panel type:

1. Add the type to `PanelType` union in `stores/workspace.ts`
2. Add the panel component in `components/`
3. Add the render case in `PanelContainer.tsx`
4. Add "New X" command in `CommandPalette.tsx`
5. If the panel needs its own state:
   - Create a store in `stores/`
   - Create hooks in `hooks/`
   - Connect to event bus in `bus.ts`
   - Add effects in `effects.ts` if needed
6. If the panel needs IPC:
   - Add IPC handler in `main/ipc/`
   - Add to preload bridge in `main/preload.ts`
   - Add types in `renderer/electron.d.ts`

## Settings

Settings currently uses React Context (`contexts/settings.tsx`), not a commiq store. This is intentional:
- Settings load once at startup and change rarely
- No cross-store coordination needed for settings
- React Context is simpler for this use case

If settings ever need to trigger store-level reactions (e.g., "when theme changes, reload all terminals"), consider migrating to a commiq store with `withInjector`.

## What NOT to put in components

Components should be pure UI. Specifically, do NOT put these in components:
- Cross-store event handling (`useEvent` on store A to dispatch to store B) — use `bus.ts`
- Side effects that should run without UI (`window.electronAPI` calls in response to events) — use `effects.ts`
- Store-to-store command routing — use `bus.ts`

Components SHOULD use:
- `useSelector` for reading state
- `useQueue` for dispatching commands
- `useEvent` for UI-only reactions (toasts, focus management, DOM manipulation tied to component lifecycle)
- `useEffect` for data plane setup (xterm.js, ResizeObserver)
