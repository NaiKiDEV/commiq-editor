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

## Connecting to Commiq MCP servers

Commiq exposes two MCP servers that let LLMs interact with your workspace:

| Server          | Default Port | What it controls                                                                        |
| --------------- | ------------ | --------------------------------------------------------------------------------------- |
| **Whiteboard**  | `3100`       | Boards, stickies, frames, connections, text labels, color meanings                      |
| **Mock Server** | `3200`       | Mock server configs, HTTP routes, response rules, WebSocket endpoints, server lifecycle |

### Prerequisites

Each MCP server has its own toggle button that must be enabled before an LLM can connect.

**Whiteboard MCP** — click the **MCP** button in the top-right of the Whiteboard panel. It turns green when running.

**Mock Server MCP** — click the **MCP** button in the header of the Mock Server panel (visible in both the server list and editor views). It turns green when running.

The port for each server can be changed in **Settings**. Both servers stop when Commiq closes.

---

### VS Code Copilot

A `.vscode/mcp.json` is already included in this repo with both servers:

```json
{
  "servers": {
    "commiq-whiteboard": {
      "type": "http",
      "url": "http://127.0.0.1:3100/mcp"
    },
    "commiq-mock-server": {
      "type": "http",
      "url": "http://127.0.0.1:3200/mcp"
    }
  }
}
```

1. **Start the server(s)** in Commiq (see Prerequisites above).

2. **Use it** — open a Copilot Chat session and ask things like:

   Whiteboard:

   > Create a sticky on the board with text "Fix auth bug", color pink

   Mock Server:

   > Create a mock server called "Users API" on port 4000 with a GET /api/users route that returns a JSON array of users

**Whiteboard tools:** `list_boards`, `create_board`, `create_sticky`, `create_frame`, `connect`, `set_color_meaning`, `create_text`, and more.

**Mock Server tools:** `list_configs`, `create_config`, `create_route`, `add_rule`, `create_ws_endpoint`, `start_server`, `stop_server`, `get_server_state`, and more.

---

### Claude Code

Add both servers to Claude Code's MCP config (one-time setup):

```bash
claude mcp add --transport http commiq-whiteboard http://127.0.0.1:3100/mcp --scope project
claude mcp add --transport http commiq-mock-server http://127.0.0.1:3200/mcp --scope project
```

Or use the `.claude/mcp.json` already included in this repo:

```json
{
  "mcpServers": {
    "commiq-whiteboard": {
      "type": "http",
      "url": "http://127.0.0.1:3100/mcp"
    },
    "commiq-mock-server": {
      "type": "http",
      "url": "http://127.0.0.1:3200/mcp"
    }
  }
}
```

1. **Verify it's connected** — in a Claude Code session run:

```text
/mcp
```

You should see `commiq-whiteboard` and `commiq-mock-server` listed as connected with their tools.

1. **Use it** — same capabilities as Copilot above.
