# Developer Tools

## Installation

### macOS — "App is damaged" / "developer cannot be verified"

The app is not code-signed, so macOS Gatekeeper blocks it on first launch. It is not actually damaged.

**Option 1 — System Settings (no terminal needed)**

1. Try to open the app — it will be blocked.
2. Open **System Settings → Privacy & Security**, scroll down.
3. Click **Open Anyway** next to the Commiq Editor entry.
4. Confirm in the dialog that appears.

**Option 2 — Terminal (one command)**

```bash
xattr -cr /path/to/CommiqEditor.app
```

Replace the path with wherever you placed the `.app` (e.g. `/Applications/CommiqEditor.app`). After running this, open the app normally.

---

## Running locally

**Prerequisites:** Node.js, [pnpm](https://pnpm.io/installation)

```bash
# Install dependencies (run from repo root)
pnpm install

# Start the app
pnpm dev
```

This launches the Electron app via `electron-forge`. The renderer hot-reloads on changes; the main process restarts automatically.

---

## Connecting to the Commiq MCP server

## Prerequisites

Open Developer Tools, go to **Settings → Whiteboard** tab, note the port (default `3100`), then click the **MCP button** (top-right of the whiteboard panel) to start the server. The button turns green when it's running.

The MCP server must be running whenever you want an LLM to interact with it. It stops when Commiq closes.

---

## VS Code Copilot

1. **Config file** — a `.vscode/mcp.json` is already included in this repo:

```json
{
  "servers": {
    "commiq-whiteboard": {
      "type": "http",
      "url": "http://127.0.0.1:3100/mcp"
    }
  }
}
```

1. **Start the server** in Commiq (see Prerequisites above).

2. **Use it** — open a Copilot Chat session and ask things like:

   > Create a sticky on the board with text "Fix auth bug", color pink

   Copilot will call `list_boards` to find the board ID, then `create_sticky` to place it. You can also ask it to:
   - Group stickies into frames
   - Connect stickies with labeled arrows
   - Read the current board state via resources (`board://{boardId}/stickies`)
   - Set color meanings (`set_color_meaning`)

---

## Claude Code

1. **Add it to Claude Code's MCP config** — run this in your terminal (one-time setup):

```bash
claude mcp add --transport http commiq-whiteboard http://127.0.0.1:3100/mcp --scope project
```

Or manually add to your project's `.mcp.json` (already included in this repo):

```json
{
  "mcpServers": {
    "commiq-whiteboard": {
      "type": "http",
      "url": "http://127.0.0.1:3100/mcp"
    }
  }
}
```

1. **Verify it's connected** — in a Claude Code session run:

```text
/mcp
```

You should see `commiq-whiteboard` listed as connected with its tools.

1. **Use it** — same capabilities as Copilot above.
