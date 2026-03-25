# Connecting to the MCP server from Claude Code

1. Start the MCP server in Commiq

Open Settings → Whiteboard tab, note the port (default 3100), then click the MCP button (top-right of the whiteboard panel) to start the server.

1. Add it to Claude Code's MCP config

Run this in your terminal (one-time setup):

claude mcp add commiq-whiteboard --transport sse <http://127.0.0.1:3100/sse>

Or manually add to ~/.claude/claude_desktop_config.json (or your project's .claude/mcp.json):

```json
{
  "mcpServers": {
    "commiq-whiteboard": {
      "transport": "sse",
      "url": "http://127.0.0.1:3100/sse"
    }
  }
}
```

1. Verify it's connected

In a Claude Code session:

/mcp

You should see commiq-whiteboard listed as connected with its tools.

1. Use it

Once connected, Claude Code can call tools like:

Create a sticky on the board with text "Fix auth bug", color pink

Claude will use list_boards to find the board ID, then create_sticky to place it. You can also ask it to:

- Group stickies into frames
- Connect stickies with labeled arrows
- Read the current board state via resources (board://{boardId}/stickies)

Note: The MCP server must be running (green button in the panel) whenever you want Claude Code to interact with it. It stops when Commiq closes.
